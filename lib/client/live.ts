import { getApp, getApps, initializeApp, type FirebaseApp } from "@firebase/app";
import { getDatabase, onValue, ref, type Database } from "@firebase/database";
import {
  API_ERROR_CODES,
  PublicRoomSchema,
  type ApiErrorCode,
  type MeResponse,
} from "@/lib/types";
import { ApiFailure, type GameApi } from "./api";

let database: Database | null = null;

// Phase end times are stamped by the game server, so countdowns follow its
// clock. Every API answer carries it, and Firebase's clock stands in until the
// first answer arrives.
let firebaseOffset = 0;
let serverOffset: number | null = null;
let bestRoundTrip = Infinity;
let offsetTakenAt = 0;

function noteServerTime(header: string | null, sentAt: number, receivedAt: number) {
  const serverTime = Number(header);
  if (!header || !Number.isFinite(serverTime)) return;
  const roundTrip = receivedAt - sentAt;
  const stale = receivedAt - offsetTakenAt > 60_000;
  if (serverOffset !== null && roundTrip > bestRoundTrip && !stale) return;
  bestRoundTrip = stale ? roundTrip : Math.min(bestRoundTrip, roundTrip);
  offsetTakenAt = receivedAt;
  serverOffset = serverTime + Math.min(roundTrip / 2, 150) - receivedAt;
}

function db(): Database {
  if (!database) {
    const app: FirebaseApp = getApps().length
      ? getApp()
      : initializeApp({
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
          databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        });
    database = getDatabase(app);
    onValue(ref(database, ".info/serverTimeOffset"), (snap) => {
      const value: unknown = snap.val();
      if (typeof value === "number") firebaseOffset = value;
    });
  }
  return database;
}

async function call<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  token: string | null,
  body?: unknown,
): Promise<T> {
  const sentAt = Date.now();
  const response = await fetch(`/api/rooms${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { "x-player-token": token } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  noteServerTime(response.headers.get("x-server-time"), sentAt, Date.now());

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {}

  if (!response.ok) throw failure(response.status, data);
  return data as T;
}

function failure(status: number, data: unknown): ApiFailure {
  const info = (data ?? {}) as { error?: unknown; code?: unknown };

  let code: ApiErrorCode = "internal";
  if (API_ERROR_CODES.includes(info.code as ApiErrorCode)) code = info.code as ApiErrorCode;
  else if (status === 404) code = "not_found";
  else if (status === 429) code = "rate_limited";

  let message = "The server had a problem. Please try again.";
  if (typeof info.error === "string" && info.error) message = info.error;
  else if (status === 429) message = "Too many requests. Wait a moment and try again.";

  return new ApiFailure(code, message, status);
}

const room = (code: string) => `/${encodeURIComponent(code)}`;

export const liveApi: GameApi = {
  mode: "live",
  createRoom: (body) => call("POST", "", null, body),
  joinRoom: (code, body) => call("POST", `${room(code)}/join`, null, body),
  leave: async (code, token) => {
    await call("POST", `${room(code)}/leave`, token);
  },
  updateSettings: async (code, token, patch) => {
    await call("PATCH", `${room(code)}/settings`, token, patch);
  },
  start: async (code, token) => {
    await call("POST", `${room(code)}/start`, token);
  },
  draft: (code, token, truths) => call("POST", `${room(code)}/draft`, token, { truths }),
  submitCard: async (code, token, body) => {
    await call("POST", `${room(code)}/card`, token, body);
  },
  guess: async (code, token, body) => {
    await call("POST", `${room(code)}/guess`, token, body);
  },
  tick: async (code, token, seq) => {
    await call("POST", `${room(code)}/tick`, token, { seq });
  },
  host: async (code, token, action) => {
    await call("POST", `${room(code)}/host`, token, action);
  },
  me: (code, token) => call<MeResponse>("GET", `${room(code)}/me`, token),

  subscribe(code, onRoom, onError) {
    return onValue(
      ref(db(), `rooms/${code}/public`),
      (snap) => {
        const raw: unknown = snap.val();
        if (raw === null) return onRoom(null);
        const parsed = PublicRoomSchema.safeParse(raw);
        if (parsed.success) onRoom(parsed.data);
        else onError(new Error("The room data could not be read."));
      },
      (error) => onError(error),
    );
  },

  now: () => Date.now() + (serverOffset ?? firebaseOffset),
};
