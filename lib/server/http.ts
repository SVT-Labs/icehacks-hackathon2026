import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { z } from "zod";
import { LIMITS, ROOM_CODE_ALPHABET } from "@/lib/constants";
import { GameError } from "@/lib/game";
import { ERROR_STATUS, describeIssues, type ApiErrorCode } from "@/lib/types";
import type { StoredRoom } from "./store";

const MAX_BODY_BYTES = 8 * 1024;
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(data, {
    status,
    // X-Server-Time lets browsers line their countdowns up with this
    // server's clock, whatever their own clock says.
    headers: { "Cache-Control": "no-store", "X-Server-Time": String(Date.now()), ...headers },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof GameError) {
    const headers: Record<string, string> =
      error instanceof RateLimited ? { "Retry-After": String(error.retryAfter) } : {};
    return json({ error: error.message, code: error.code }, ERROR_STATUS[error.code], headers);
  }
  console.error("[api] unexpected error", error instanceof Error ? (error.stack ?? error.message) : error);
  const code: ApiErrorCode = "internal";
  return json({ error: "The server had a problem. Please try again.", code }, 500);
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    return errorResponse(error);
  }
}

export async function readBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw new GameError("bad_request", "That request is too large.");
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    throw new GameError("bad_request", "That request is too large.");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new GameError("bad_request", "The request body must be JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new GameError("bad_request", describeIssues(parsed.error));
  return parsed.data;
}

export async function roomCode(params: Promise<{ code: string }>): Promise<string> {
  const { code } = await params;
  const upper = code.toUpperCase();
  const valid =
    upper.length === LIMITS.ROOM_CODE_LENGTH &&
    [...upper].every((c) => ROOM_CODE_ALPHABET.includes(c));
  if (!valid) throw new GameError("not_found", "This room does not exist. Check the code and try again.");
  return upper;
}

export function tokenOf(request: Request): string {
  const token = request.headers.get("x-player-token");
  if (!token) throw new GameError("forbidden", "You are not a player in this room.");
  return token;
}

export function playerFor(room: StoredRoom, token: string): string {
  const given = Buffer.from(token);
  let found: string | null = null;
  for (const [playerId, stored] of Object.entries(room.tokens)) {
    const expected = Buffer.from(stored);
    if (expected.length === given.length && timingSafeEqual(expected, given)) found = playerId;
  }
  if (!found || !room.state.pub.players[found]) {
    throw new GameError("forbidden", "You are not a player in this room.");
  }
  return found;
}

export function liveTokens(room: StoredRoom): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const [id, token] of Object.entries(room.tokens)) {
    if (Object.prototype.hasOwnProperty.call(room.state.pub.players, id)) tokens[id] = token;
  }
  return tokens;
}

function randomString(alphabet: string, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

export const newRoomCode = () => randomString(ROOM_CODE_ALPHABET, LIMITS.ROOM_CODE_LENGTH);
export const newPlayerId = () => `p_${randomString(ID_ALPHABET, 12)}`;
export const newToken = () => randomBytes(24).toString("base64url");

class RateLimited extends GameError {
  retryAfter: number;
  constructor(retryAfter: number) {
    super("rate_limited", "Too many rooms or joins from here. Wait a moment and try again.");
    this.retryAfter = retryAfter;
  }
}

const WINDOW_MS = 60_000;
const PER_WINDOW = 20;
// Counted in memory per function instance, so this limit is best effort only.
const hits = new Map<string, { count: number; resetAt: number }>();

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-nf-client-connection-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export function limitByIp(request: Request, now = Date.now()): void {
  const ip = clientIp(request);
  if (hits.size > 10_000) {
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }
  const entry = hits.get(ip);
  if (!entry || entry.resetAt <= now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
  if (entry.count > PER_WINDOW) throw new RateLimited(Math.ceil((entry.resetAt - now) / 1000));
}

export function resetRateLimits(): void {
  hits.clear();
}
