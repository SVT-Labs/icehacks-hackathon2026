// Calls the route handlers directly, the way Next would, against the memory
// store. Every call also runs the leak check.

import { expect } from "vitest";
import * as rootRoute from "@/app/api/rooms/route";
import * as cardRoute from "@/app/api/rooms/[code]/card/route";
import * as draftRoute from "@/app/api/rooms/[code]/draft/route";
import * as guessRoute from "@/app/api/rooms/[code]/guess/route";
import * as hostRoute from "@/app/api/rooms/[code]/host/route";
import * as joinRoute from "@/app/api/rooms/[code]/join/route";
import * as leaveRoute from "@/app/api/rooms/[code]/leave/route";
import * as meRoute from "@/app/api/rooms/[code]/me/route";
import * as settingsRoute from "@/app/api/rooms/[code]/settings/route";
import * as startRoute from "@/app/api/rooms/[code]/start/route";
import * as tickRoute from "@/app/api/rooms/[code]/tick/route";
import { PublicRoomSchema, type PublicRoom } from "@/lib/types";
import { memoryRaw } from "@/lib/server/store";

type Handler = (request: Request, ctx: { params: Promise<{ code: string }> }) => Promise<Response>;

const ROUTES: Record<string, { method: string; handler: Handler }> = {
  join: { method: "POST", handler: joinRoute.POST },
  leave: { method: "POST", handler: leaveRoute.POST },
  settings: { method: "PATCH", handler: settingsRoute.PATCH },
  start: { method: "POST", handler: startRoute.POST },
  draft: { method: "POST", handler: draftRoute.POST },
  card: { method: "POST", handler: cardRoute.POST },
  guess: { method: "POST", handler: guessRoute.POST },
  tick: { method: "POST", handler: tickRoute.POST },
  host: { method: "POST", handler: hostRoute.POST },
  me: { method: "GET", handler: meRoute.GET },
};

export const AUTH_ROUTES = ["leave", "settings", "start", "draft", "card", "guess", "tick", "host", "me"];

export type Result<T = Record<string, unknown>> = { status: number; body: T; headers: Headers };

/** Every response body seen, for the leak test. */
export const seenBodies: { route: string; body: unknown }[] = [];

function request(method: string, path: string, opts: { token?: string; body?: unknown; raw?: string; ip?: string }) {
  const headers: Record<string, string> = {};
  if (opts.token) headers["x-player-token"] = opts.token;
  if (opts.ip) headers["x-nf-client-connection-ip"] = opts.ip;
  let payload: string | undefined = opts.raw;
  if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(opts.body);
  }
  return new Request(`http://localhost/api/rooms${path}`, { method, headers, body: payload });
}

async function finish(route: string, response: Response, code?: string): Promise<Result> {
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = (await response.json()) as Record<string, unknown>;
  seenBodies.push({ route, body });
  if (route !== "me") expect(JSON.stringify(body)).not.toContain("lieIndex");
  if (code) checkStoredPublic(code);
  return { status: response.status, body, headers: response.headers };
}

export async function createRoom(body: unknown, ip = "10.0.0.1"): Promise<Result> {
  const response = await rootRoute.POST(request("POST", "", { body, ip }));
  const result = await finish("create", response);
  if (result.status === 200) checkStoredPublic(result.body.code as string);
  return result;
}

export async function call(
  route: keyof typeof ROUTES | string,
  code: string,
  opts: { token?: string; body?: unknown; raw?: string; ip?: string } = {},
): Promise<Result> {
  const { method, handler } = ROUTES[route];
  const path = route === "me" ? `/${code}/me` : `/${code}/${route}`;
  const response = await handler(request(method, path, { ...opts, ip: opts.ip ?? "10.0.0.1" }), {
    params: Promise.resolve({ code }),
  });
  return finish(route, response, code.toUpperCase());
}

/** The public room exactly as a browser would read it. */
export function publicRoom(code: string): PublicRoom {
  const raw = memoryRaw(code) as { public?: unknown } | null;
  return PublicRoomSchema.parse(raw?.public);
}

/** Reveals the leak check saw with the lie index public, proving it ran. */
export const revealsSeen: number[] = [];

/** The lie index must never be in the browser-readable half before a reveal. */
export function checkStoredPublic(code: string): void {
  const raw = memoryRaw(code) as { public?: unknown } | null;
  if (!raw) return;
  const room = publicRoom(code);
  const text = JSON.stringify(raw.public);
  if (room.phase !== "reveal") expect(text).not.toContain("lieIndex");
  else if (text.includes("lieIndex") && !revealsSeen.includes(room.seq)) revealsSeen.push(room.seq);
  // Nothing from the server-only halves ever appears in the public half.
  expect(text).not.toContain("botPlan");
  expect(text).not.toContain("candidates");
}

export async function create(name = "Host") {
  const result = await createRoom({ nickname: name, avatar: "navy" });
  expect(result.status).toBe(200);
  return result.body as { code: string; playerId: string; token: string };
}

export async function join(code: string, name: string) {
  const result = await call("join", code, { body: { nickname: name, avatar: "teal" } });
  expect(result.status).toBe(200);
  return result.body as { playerId: string; token: string };
}
