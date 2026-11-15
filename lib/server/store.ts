import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getDatabase, type Database } from "firebase-admin/database";
import { GameError, PrivateRoomSchema, type RoomState } from "@/lib/game";
import { PublicRoomSchema } from "@/lib/types";
import { z } from "zod";

export type StoredRoom = { state: RoomState; tokens: Record<string, string> };

export const NO_CHANGE = Symbol("no change");
export type Mutation = (room: StoredRoom) => StoredRoom | typeof NO_CHANGE;

const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_BATCH = 20;

interface Driver {
  create(code: string, raw: RawRoom, createdAt: number): Promise<boolean>;
  read(code: string): Promise<unknown>;
  transact(code: string, fn: (raw: unknown) => RawRoom | undefined): Promise<boolean | null>;
  increment(path: string): Promise<number>;
  expired(cutoff: number, limit: number): Promise<string[]>;
  remove(codes: string[]): Promise<void>;
}

type RawRoom = { public: unknown; private: unknown; tokens: Record<string, string> };

const TokensSchema = z.record(z.string(), z.string()).default({});

function toRaw(room: StoredRoom): RawRoom {
  return JSON.parse(
    JSON.stringify({ public: room.state.pub, private: room.state.priv, tokens: room.tokens }),
  ) as RawRoom;
}

function fromRaw(raw: unknown): StoredRoom {
  const value = (raw ?? {}) as Record<string, unknown>;
  const pub = PublicRoomSchema.safeParse(value.public);
  const priv = PrivateRoomSchema.safeParse(value.private ?? {});
  const tokens = TokensSchema.safeParse(value.tokens ?? {});
  if (!pub.success || !priv.success || !tokens.success) {
    throw new Error("Stored room failed to parse");
  }
  return { state: { pub: pub.data, priv: priv.data }, tokens: tokens.data };
}

function notFound(): never {
  throw new GameError("not_found", "This room does not exist. Check the code and try again.");
}

export async function createRoom(
  code: string,
  state: RoomState,
  tokens: Record<string, string>,
): Promise<boolean> {
  return driver().create(code, toRaw({ state, tokens }), state.pub.createdAt);
}

export async function readRoom(code: string): Promise<StoredRoom> {
  const raw = await driver().read(code);
  if (raw === null || raw === undefined) notFound();
  return fromRaw(raw);
}

export async function mutateRoom(code: string, fn: Mutation): Promise<StoredRoom> {
  let result: StoredRoom | null = null;
  let failure: unknown = null;
  const found = await driver().transact(code, (raw) => {
    // Pure apart from capturing the outcome: the database may call this
    // several times, first with a locally cached null.
    result = null;
    failure = null;
    if (raw === null || raw === undefined) return undefined;
    try {
      const current = fromRaw(raw);
      const next = fn(current);
      if (next === NO_CHANGE) {
        result = current;
        return undefined;
      }
      result = next;
      return toRaw(next);
    } catch (error) {
      failure = error;
      return undefined;
    }
  });
  if (failure) throw failure;
  if (found === null || !result) notFound();
  return result;
}

export async function countLlmCall(now: number): Promise<number> {
  return driver().increment(`meta/llm/${new Date(now).toISOString().slice(0, 10)}`);
}

export async function cleanupOldRooms(now: number): Promise<number> {
  const d = driver();
  const codes = await d.expired(now - ROOM_TTL_MS, CLEANUP_BATCH);
  if (codes.length > 0) await d.remove(codes);
  return codes.length;
}

function firebaseConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY &&
      process.env.FIREBASE_DATABASE_URL,
  );
}

let cachedDriver: Driver | null = null;

function driver(): Driver {
  cachedDriver ??= firebaseConfigured() ? firebaseDriver(adminDb()) : memoryDriver();
  return cachedDriver;
}

function adminDb(): Database {
  const name = "thin-ice";
  const app: App = getApps().some((a) => a.name === name)
    ? getApp(name)
    : initializeApp(
        {
          credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            // Netlify and .env files carry the line breaks as the two characters \n.
            // Quotes pasted into a hosting dashboard along with the key are dropped.
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/^"|"$/g, "").replace(/\\n/g, "\n"),
          }),
          databaseURL: process.env.FIREBASE_DATABASE_URL,
        },
        name,
      );
  return getDatabase(app);
}

export function firebaseDriver(db: Database): Driver {
  const roomRef = (code: string) => db.ref(`rooms/${code}`);
  return {
    async create(code, raw, createdAt) {
      const { committed } = await roomRef(code).transaction(
        (current: unknown) => (current === null ? raw : undefined),
        undefined,
        false,
      );
      if (committed) await db.ref(`index/${code}`).set(createdAt);
      return committed;
    },
    async read(code) {
      const snap = await roomRef(code).get();
      return snap.val();
    },
    async transact(code, fn) {
      let sawRoom = false;
      const { committed } = await roomRef(code).transaction(
        (current: unknown) => {
          // The first call may see a locally cached null. Returning null then
          // asks the server to compare; if the room exists, we are called again
          // with the real value. If it really is missing, null writes nothing.
          if (current === null) {
            sawRoom = false;
            return null;
          }
          sawRoom = true;
          // Never abort here: an abort on the first call is decided on the
          // local cache, which may be stale, and the server is never asked.
          // Returning the value unchanged makes the server compare it; a stale
          // cache then reruns us on fresh data, a fresh one writes nothing new.
          return fn(current) ?? current;
        },
        undefined,
        false,
      );
      if (!sawRoom) return null;
      return committed;
    },
    async increment(path) {
      const { snapshot } = await db
        .ref(path)
        .transaction((n: unknown) => (typeof n === "number" ? n : 0) + 1, undefined, false);
      const value: unknown = snapshot.val();
      return typeof value === "number" ? value : 0;
    },
    async expired(cutoff, limit) {
      const snap = await db
        .ref("index")
        .orderByValue()
        .endAt(cutoff)
        .limitToFirst(limit)
        .get();
      const codes: string[] = [];
      snap.forEach((child) => {
        if (child.key) codes.push(child.key);
      });
      return codes;
    },
    async remove(codes) {
      const updates: Record<string, null> = {};
      for (const code of codes) {
        updates[`rooms/${code}`] = null;
        updates[`index/${code}`] = null;
      }
      await db.ref().update(updates);
    },
  };
}

export function rtdbStrip(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    const items = value.map(rtdbStrip);
    return items.every((item) => item === undefined) ? undefined : items;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const kept = rtdbStrip(item);
      if (kept !== undefined) out[key] = kept;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  return value;
}

type MemoryData = { rooms: Map<string, unknown>; index: Map<string, number>; counters: Map<string, number> };

function memoryData(): MemoryData {
  const g = globalThis as { __thinIceMemory?: MemoryData };
  g.__thinIceMemory ??= { rooms: new Map(), index: new Map(), counters: new Map() };
  return g.__thinIceMemory;
}

export function resetMemoryStore(): void {
  const data = memoryData();
  data.rooms.clear();
  data.index.clear();
  data.counters.clear();
}

export function memoryRaw(code: string): unknown {
  const raw = memoryData().rooms.get(code);
  return raw === undefined ? null : structuredClone(raw);
}

export function memorySetIndex(code: string, createdAt: number): void {
  memoryData().index.set(code, createdAt);
}

function memoryDriver(): Driver {
  const data = memoryData();
  return {
    async create(code, raw, createdAt) {
      if (data.rooms.has(code)) return false;
      data.rooms.set(code, rtdbStrip(raw));
      data.index.set(code, createdAt);
      return true;
    },
    async read(code) {
      const raw = data.rooms.get(code);
      return raw === undefined ? null : structuredClone(raw);
    },
    async transact(code, fn) {
      const raw = data.rooms.get(code);
      if (raw === undefined) return null;
      const next = fn(structuredClone(raw));
      if (next === undefined) return false;
      data.rooms.set(code, rtdbStrip(next));
      return true;
    },
    async increment(path) {
      const n = (data.counters.get(path) ?? 0) + 1;
      data.counters.set(path, n);
      return n;
    },
    async expired(cutoff, limit) {
      return [...data.index.entries()]
        .filter(([, at]) => at <= cutoff)
        .sort((a, b) => a[1] - b[1])
        .slice(0, limit)
        .map(([code]) => code);
    },
    async remove(codes) {
      for (const code of codes) {
        data.rooms.delete(code);
        data.index.delete(code);
      }
    },
  };
}
