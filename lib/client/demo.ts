// The demo driver: the whole game runs in this browser with the same engine
// the server uses. Rooms are kept in localStorage and announced to other tabs,
// so two tabs on one computer can play together without any backend.
//
// The "AI" here is a fixed list of believable lies. The real AI lives on the
// server and is only used by the live driver.

import { LIMITS, ROOM_CODE_ALPHABET } from "@/lib/constants";
import {
  ERROR_STATUS,
  PublicRoomSchema,
  type DraftResponse,
  type PublicRoom,
} from "@/lib/types";
import { ApiFailure, type GameApi } from "./api";

type Engine = typeof import("@/lib/game");
type RoomState = import("@/lib/game").RoomState;

type Stored = { state: RoomState; tokens: Record<string, string> };

const key = (code: string) => `thinice:demo:${code}`;
const CHANNEL = "thinice-demo";

let engine: Promise<Engine> | null = null;
const loadEngine = () => (engine ??= import("@/lib/game"));

const listeners = new Map<string, Set<(room: PublicRoom | null) => void>>();
let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (channel || typeof BroadcastChannel === "undefined") return channel;
  channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event) => {
    if (typeof event.data === "string") emit(event.data);
  };
  return channel;
}

function load(code: string): Stored | null {
  try {
    const raw = window.localStorage.getItem(key(code));
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function save(code: string, stored: Stored) {
  window.localStorage.setItem(key(code), JSON.stringify(stored));
  emit(code);
  getChannel()?.postMessage(code);
}

function publicOf(code: string): PublicRoom | null {
  const stored = load(code);
  if (!stored) return null;
  // Parse exactly as the live driver does, so both drivers hand the screens
  // the same shape.
  const parsed = PublicRoomSchema.safeParse(stored.state.pub);
  return parsed.success ? parsed.data : null;
}

function emit(code: string) {
  const set = listeners.get(code);
  if (!set || set.size === 0) return;
  const room = publicOf(code);
  set.forEach((fn) => fn(room));
}

function randomId(prefix: string, length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = prefix;
  for (const b of bytes) out += "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36];
  return out;
}

function randomCode(): string {
  const bytes = new Uint8Array(LIMITS.ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length];
  return out;
}

function toFailure(e: Engine, error: unknown): unknown {
  if (error instanceof e.GameError) {
    return new ApiFailure(error.code, error.message, ERROR_STATUS[error.code]);
  }
  return error;
}

/** Loads a room, checks the token, applies one engine call and saves. */
async function mutate(
  code: string,
  token: string,
  fn: (e: Engine, state: RoomState, playerId: string) => RoomState,
): Promise<RoomState> {
  const e = await loadEngine();
  const stored = load(code);
  if (!stored) throw new ApiFailure("not_found", "This room no longer exists.", 404);
  const playerId = Object.keys(stored.tokens).find((id) => stored.tokens[id] === token);
  if (!playerId) {
    throw new ApiFailure("forbidden", "You are not a player in this room.", 403);
  }
  let next: RoomState;
  try {
    next = fn(e, stored.state, playerId);
  } catch (error) {
    throw toFailure(e, error);
  }
  if (next !== stored.state) {
    const tokens = { ...stored.tokens };
    for (const id of Object.keys(tokens)) {
      if (!next.pub.players[id]) delete tokens[id];
    }
    save(code, { state: next, tokens });
  }
  return next;
}

const DEMO_LIES = [
  "I once missed a flight because I fell asleep at the gate.",
  "I have never broken a bone in my body.",
  "I can whistle a whole song with my mouth closed.",
  "I shared a lift with a famous actor and said nothing.",
  "I won a school chess tournament when I was nine.",
  "I am allergic to strawberries.",
  "I have been stung by a jellyfish twice.",
  "I got locked inside a library after closing time.",
  "I only learned to ride a bike at fourteen.",
  "I used to sleepwalk when I was little.",
  "I have eaten the same breakfast every day for three years.",
  "I once cycled sixty kilometres to visit a friend.",
];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const demoApi: GameApi = {
  mode: "demo",

  async createRoom(body) {
    const e = await loadEngine();
    let code = randomCode();
    while (load(code)) code = randomCode();
    const playerId = randomId("p_");
    const token = randomId("t_", 24);
    try {
      const state = e.createRoom({
        code,
        playerId,
        name: body.nickname,
        avatar: body.avatar,
        now: Date.now(),
      });
      save(code, { state, tokens: { [playerId]: token } });
    } catch (error) {
      throw toFailure(e, error);
    }
    return { code, playerId, token };
  },

  async joinRoom(code, body) {
    const e = await loadEngine();
    const stored = load(code);
    if (!stored) throw new ApiFailure("not_found", "This room does not exist.", 404);
    const playerId = randomId("p_");
    const token = randomId("t_", 24);
    try {
      const state = e.joinRoom(stored.state, {
        playerId,
        name: body.nickname,
        avatar: body.avatar,
        now: Date.now(),
      });
      save(code, { state, tokens: { ...stored.tokens, [playerId]: token } });
    } catch (error) {
      throw toFailure(e, error);
    }
    return { playerId, token };
  },

  async leave(code, token) {
    await mutate(code, token, (e, s, playerId) =>
      e.leaveRoom(s, { playerId, now: Date.now(), rng: Math.random }),
    );
  },

  async updateSettings(code, token, patch) {
    await mutate(code, token, (e, s, playerId) => e.updateSettings(s, { playerId, patch }));
  },

  async start(code, token) {
    await mutate(code, token, (e, s, playerId) =>
      e.startGame(s, { playerId, now: Date.now(), rng: Math.random }),
    );
  },

  async draft(code, token, truths): Promise<DraftResponse> {
    // Check the limit first, then pretend to think, as the server would.
    await mutate(code, token, (e, s, playerId) => {
      e.draftsLeft(s, playerId);
      return s;
    });
    await wait(900 + Math.random() * 700);

    let aiOff = false;
    try {
      aiOff = window.localStorage.getItem("thinice:demo:ai") === "off";
    } catch {
      // ignore
    }

    let response: DraftResponse = { candidates: [], source: "unavailable", draftsLeft: 0 };
    await mutate(code, token, (e, s, playerId) => {
      const name = s.pub.players[playerId]?.name ?? "them";
      const pool = DEMO_LIES.filter(
        (lie) => !truths.some((t) => t.toLowerCase() === lie.toLowerCase()),
      ).sort(() => Math.random() - 0.5);
      const next = e.setDraft(s, {
        playerId,
        truths,
        candidates: aiOff ? [] : pool.slice(0, s.pub.settings.lieOptions),
        starters: truths.map((t) => `Ask ${name} about this: "${t}"`),
        source: aiOff ? "unavailable" : "ai",
        now: Date.now(),
      });
      const draft = e.meView(next, playerId).draft;
      response = {
        candidates: draft?.candidates ?? [],
        source: draft?.source ?? "unavailable",
        draftsLeft: draft?.draftsLeft ?? 0,
      };
      return next;
    });
    return response;
  },

  async submitCard(code, token, body) {
    await mutate(code, token, (e, s, playerId) =>
      e.submitCard(s, {
        playerId,
        truths: body.truths,
        lie: body.lie,
        now: Date.now(),
        rng: Math.random,
      }),
    );
  },

  async guess(code, token, body) {
    await mutate(code, token, (e, s, playerId) =>
      e.submitGuess(s, {
        playerId,
        seq: body.seq,
        choice: body.choice,
        now: Date.now(),
        rng: Math.random,
      }),
    );
  },

  async tick(code, token, seq) {
    await mutate(code, token, (e, s) => e.tick(s, { seq, now: Date.now(), rng: Math.random }));
  },

  async host(code, token, action) {
    await mutate(code, token, (e, s, playerId) =>
      e.hostAction(s, { playerId, action, now: Date.now(), rng: Math.random }),
    );
  },

  async me(code, token) {
    const e = await loadEngine();
    const stored = load(code);
    if (!stored) throw new ApiFailure("not_found", "This room no longer exists.", 404);
    const playerId = Object.keys(stored.tokens).find((id) => stored.tokens[id] === token);
    if (!playerId) {
      throw new ApiFailure("forbidden", "You are not a player in this room.", 403);
    }
    try {
      return e.meView(stored.state, playerId);
    } catch (error) {
      throw toFailure(e, error);
    }
  },

  subscribe(code, onRoom) {
    getChannel();
    let set = listeners.get(code);
    if (!set) listeners.set(code, (set = new Set()));
    set.add(onRoom);
    // Storage events cover browsers without BroadcastChannel.
    const onStorage = (event: StorageEvent) => {
      if (event.key === key(code)) onRoom(publicOf(code));
    };
    window.addEventListener("storage", onStorage);
    queueMicrotask(() => onRoom(publicOf(code)));
    return () => {
      set.delete(onRoom);
      window.removeEventListener("storage", onStorage);
    };
  },

  now: () => Date.now(),
};
