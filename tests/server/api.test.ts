import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/server/http";
import { memoryRaw, memorySetIndex, resetMemoryStore } from "@/lib/server/store";
import * as publicRoute from "@/app/api/rooms/[code]/route";
import { AUTH_ROUTES, call, create, createRoom, join, publicRoom } from "./helpers";

// The draft route's AI step, controllable per test. Everything else is real.
const ai = vi.hoisted(() => ({ next: null as null | { verdict: string; lies?: string[]; starters?: string[] } }));
vi.mock("@/lib/server/llm", async (original) => {
  const real = await original<typeof import("@/lib/server/llm")>();
  return {
    ...real,
    draftLies: (...args: Parameters<typeof real.draftLies>) =>
      ai.next ? Promise.resolve(ai.next) : real.draftLies(...args),
  };
});

const TRUTHS: [string, string] = ["I have climbed a volcano in Iceland.", "I keep a jar of buttons from my gran."];

beforeEach(() => {
  for (const key of ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "FIREBASE_DATABASE_URL", "ANTHROPIC_API_KEY"]) {
    delete process.env[key];
  }
  process.env.DEMO_MODE = "true";
  ai.next = null;
  resetMemoryStore();
  resetRateLimits();
});

async function writingRoom() {
  const host = await create("Ada");
  const guest = await join(host.code, "Bea");
  expect((await call("settings", host.code, { token: host.token, body: { botCount: 0 } })).status).toBe(200);
  expect((await call("start", host.code, { token: host.token })).status).toBe(200);
  return { host, guest, code: host.code };
}

describe("authentication", () => {
  it.each(AUTH_ROUTES)("%s rejects a missing or wrong token", async (route) => {
    const host = await create();
    const VALID: Record<string, unknown> = {
      settings: { maxRounds: 2 },
      draft: { truths: TRUTHS },
      card: { truths: TRUTHS, lie: { kind: "own", text: "I have a twin brother in Peru." } },
      guess: { seq: 0, choice: 0 },
      tick: { seq: 0 },
      host: { action: "skip" },
    };
    const body = VALID[route];
    const missing = await call(route, host.code, { body });
    expect(missing.status).toBe(403);
    expect(missing.body.code).toBe("forbidden");
    const wrong = await call(route, host.code, { token: "not-a-real-token", body });
    expect(wrong.status).toBe(403);
    expect(wrong.body.code).toBe("forbidden");
  });

  it("host-only routes reject a non-host", async () => {
    const host = await create();
    const guest = await join(host.code, "Bea");
    const settings = await call("settings", host.code, { token: guest.token, body: { maxRounds: 2 } });
    expect(settings.status).toBe(403);
    expect((await call("start", host.code, { token: guest.token })).status).toBe(403);
    const kick = await call("host", host.code, { token: guest.token, body: { action: "kick", targetId: host.playerId } });
    expect(kick.status).toBe(403);
    expect(kick.body.code).toBe("forbidden");
  });

  it("GET /{code} returns the public half only", async () => {
    const { host, code } = await writingRoom();
    await call("draft", code, { token: host.token, body: { truths: TRUTHS } });
    const response = await publicRoute.GET(new Request(`http://localhost/api/rooms/${code}`), {
      params: Promise.resolve({ code }),
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(JSON.parse(text).code).toBe(code);
    for (const secret of [host.token, TRUTHS[0], "drafts", "tokens", "lieIndex"]) expect(text).not.toContain(secret);
  });

  it("accepts the room code in lower case and rejects unknown rooms", async () => {
    const host = await create();
    expect((await call("me", host.code.toLowerCase(), { token: host.token })).status).toBe(200);
    const missing = await call("me", "ZZZZZ", { token: host.token });
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("not_found");
    expect((await call("join", "ZZZZZ", { body: { nickname: "Bea", avatar: "teal" } })).status).toBe(404);
  });
});

describe("bodies and errors", () => {
  it("rejects invalid JSON, schema failures and bodies over 8 KB", async () => {
    const host = await create();
    const bad = await call("settings", host.code, { token: host.token, raw: "{not json" });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("bad_request");
    const schema = await call("settings", host.code, { token: host.token, body: { maxRounds: 99 } });
    expect(schema.status).toBe(400);
    expect(typeof schema.body.error).toBe("string");
    const big = await call("tick", host.code, { token: host.token, raw: JSON.stringify({ seq: 0, pad: "x".repeat(9000) }) });
    expect(big.status).toBe(400);
  });

  it("answers a stale seq on guess with 409 stale", async () => {
    const { host, guest, code } = await writingRoom();
    for (const seat of [host, guest]) {
      await call("card", code, { token: seat.token, body: { truths: TRUTHS, lie: { kind: "own", text: "I have a twin brother in Peru." } } });
    }
    const room = publicRoom(code);
    expect(room.phase).toBe("guessing");
    const guesser = room.card!.authorId === host.playerId ? guest : host;
    const stale = await call("guess", code, { token: guesser.token, body: { seq: room.seq - 1, choice: 1 } });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("stale");
  });

  it("treats an early or stale tick as a no-op", async () => {
    const { host, code } = await writingRoom();
    const before = memoryRaw(code);
    expect((await call("tick", code, { token: host.token, body: { seq: 0 } })).status).toBe(200);
    expect((await call("tick", code, { token: host.token, body: { seq: publicRoom(code).seq } })).status).toBe(200);
    expect(memoryRaw(code)).toEqual(before);
  });

  it("limits room creation per IP with Retry-After", async () => {
    for (let i = 0; i < 20; i++) {
      expect((await createRoom({ nickname: `P${i}`, avatar: "navy" }, "1.2.3.4")).status).toBe(200);
    }
    const limited = await createRoom({ nickname: "Late", avatar: "navy" }, "1.2.3.4");
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe("rate_limited");
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await createRoom({ nickname: "Other", avatar: "navy" }, "5.6.7.8")).status).toBe(200);
  });

  it("deletes rooms older than a day when a room is created", async () => {
    const old = await create("Old");
    memorySetIndex(old.code, Date.now() - 25 * 60 * 60 * 1000);
    const fresh = await create("New");
    expect(memoryRaw(old.code)).toBeNull();
    expect(memoryRaw(fresh.code)).not.toBeNull();
  });

  it("issues well-formed ids and tokens", async () => {
    const host = await create();
    expect(host.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
    expect(host.playerId).toMatch(/^p_[a-z0-9]{10,}$/);
    expect(Buffer.from(host.token, "base64url").length).toBeGreaterThanOrEqual(16);
  });
});

describe("moderation", () => {
  it("rejects unsafe nicknames on create and join", async () => {
    const bad = await createRoom({ nickname: "fuckface", avatar: "navy" });
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe("unsafe");
    const host = await create();
    const url = await call("join", host.code, { body: { nickname: "www.spam.com", avatar: "teal" } });
    expect(url.status).toBe(422);
  });

  it("tidies nicknames", async () => {
    const host = await create("  Ada \u0007 Love  ");
    expect(publicRoom(host.code).players[host.playerId].name).toBe("Ada Love");
  });

  it("rejects unsafe own lies and stores nothing", async () => {
    const { host, code } = await writingRoom();
    for (const text of ["Call me on 0612 345 678 any time.", "My e-mail is ada@example.com, write!"]) {
      const card = await call("card", code, { token: host.token, body: { truths: TRUTHS, lie: { kind: "own", text } } });
      expect(card.status).toBe(422);
      expect(card.body.code).toBe("unsafe");
    }
    expect(publicRoom(code).players[host.playerId].ready).toBe(false);
  });
});

describe("draft", () => {
  it("returns AI lies in demo mode and counts the request", async () => {
    const { host, code } = await writingRoom();
    const draft = await call("draft", code, { token: host.token, body: { truths: TRUTHS } });
    expect(draft.status).toBe(200);
    expect(draft.body.source).toBe("ai");
    expect((draft.body.candidates as string[]).length).toBe(3);
    expect(draft.body.draftsLeft).toBe(2);
    const me = await call("me", code, { token: host.token });
    expect((me.body.draft as { candidates: string[] }).candidates).toEqual(draft.body.candidates);
  });

  it("puts the nickname into the starters", async () => {
    const { host, code } = await writingRoom();
    ai.next = { verdict: "ok", lies: ["I can juggle five oranges.", "I once met a real astronaut.", "I have never seen snow fall."], starters: ["Ask {name} about the volcano.", "Ask {name} about the buttons."] };
    await call("draft", code, { token: host.token, body: { truths: TRUTHS } });
    const raw = memoryRaw(code) as { private: { drafts: Record<string, { starters: string[] }> } };
    expect(raw.private.drafts[host.playerId].starters).toEqual(["Ask Ada about the volcano.", "Ask Ada about the buttons."]);
  });

  it("answers unsafe when the AI judges a truth unsafe and stores nothing", async () => {
    const { host, code } = await writingRoom();
    ai.next = { verdict: "unsafe" };
    const draft = await call("draft", code, { token: host.token, body: { truths: TRUTHS } });
    expect(draft.status).toBe(422);
    expect(draft.body.code).toBe("unsafe");
    expect((await call("me", code, { token: host.token })).body.draft).toBeNull();
  });

  it("answers unsafe for truths the block list catches, before any AI call", async () => {
    const { host, code } = await writingRoom();
    ai.next = { verdict: "ok", lies: [], starters: [] }; // would fail if reached
    const draft = await call("draft", code, { token: host.token, body: { truths: ["My number is +31 6 1234 5678 ok.", TRUTHS[1]] } });
    expect(draft.status).toBe(422);
  });

  it("falls back to unavailable without failing when there is no AI", async () => {
    const { host, guest, code } = await writingRoom();
    process.env.DEMO_MODE = "false";
    const draft = await call("draft", code, { token: host.token, body: { truths: TRUTHS } });
    expect(draft.status).toBe(200);
    expect(draft.body).toEqual({ candidates: [], source: "unavailable", draftsLeft: 2 });
    // The player can still lock in a card with their own lie.
    const card = await call("card", code, { token: host.token, body: { truths: TRUTHS, lie: { kind: "own", text: "I have a twin brother in Peru." } } });
    expect(card.status).toBe(200);
    expect((await call("draft", code, { token: host.token, body: { truths: TRUTHS } })).body.code).toBe("wrong_phase");
    // Another player's /me never shows this player's draft or card.
    const other = await call("me", code, { token: guest.token });
    expect(other.body.draft).toBeNull();
    expect(other.body.card).toBeNull();
  });

  it("stops after the per-round limit", async () => {
    const { host, code } = await writingRoom();
    for (let i = 0; i < 3; i++) expect((await call("draft", code, { token: host.token, body: { truths: TRUTHS } })).status).toBe(200);
    const fourth = await call("draft", code, { token: host.token, body: { truths: TRUTHS } });
    expect(fourth.status).toBe(429);
    expect(fourth.body.code).toBe("rate_limited");
  });
});
