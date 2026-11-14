// The live driver: HTTP calls to /api/rooms for every action, and a read-only
// Firebase Realtime Database subscription for the room's public state.

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getDatabase, onValue, ref, type Database } from "firebase/database";
import {
  API_ERROR_CODES,
  PublicRoomSchema,
  type ApiErrorCode,
  type MeResponse,
} from "@/lib/types";
import { ApiFailure, type GameApi } from "./api";

let database: Database | null = null;
let clockOffset = 0;

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
    // Firebase reports how far this device's clock is from the server's.
    onValue(ref(database, ".info/serverTimeOffset"), (snap) => {
      const value: unknown = snap.val();
      if (typeof value === "number") clockOffset = value;
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
  const response = await fetch(`/api/rooms${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { "x-player-token": token } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // An error page instead of JSON; handled below by status.
  }

  if (!response.ok) {
    const info = (data ?? {}) as { error?: unknown; code?: unknown };
    const code: ApiErrorCode = API_ERROR_CODES.includes(info.code as ApiErrorCode)
      ? (info.code as ApiErrorCode)
      : response.status === 404
        ? "not_found"
        : response.status === 429
          ? "rate_limited"
          : "internal";
    const message =
      typeof info.error === "string" && info.error
        ? info.error
        : response.status === 429
          ? "Too many requests. Wait a moment and try again."
          : "The server had a problem. Please try again.";
    throw new ApiFailure(code, message, response.status);
  }
  return data as T;
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

  now: () => Date.now() + clockOffset,
};
