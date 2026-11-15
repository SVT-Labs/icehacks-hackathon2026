import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/server/http";
import { resetMemoryStore } from "@/lib/server/store";
import type { MeResponse } from "@/lib/types";
import { call, create, join, publicRoom, revealsSeen, seenBodies } from "./helpers";

type Seat = { playerId: string; token: string };

beforeEach(() => {
  for (const key of ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "FIREBASE_DATABASE_URL"]) {
    delete process.env[key];
  }
  process.env.DEMO_MODE = "true";
  resetMemoryStore();
  resetRateLimits();
  seenBodies.length = 0;
  revealsSeen.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

const TRUTHS: Record<number, [string, string]> = {
  0: ["I have climbed a volcano in Iceland.", "I keep a jar of buttons from my gran."],
  1: ["I learned to juggle during a power cut.", "My first job was washing dishes at a zoo."],
};

async function checkMe(code: string, seats: Seat[]) {
  const views: MeResponse[] = [];
  for (const seat of seats) {
    const me = await call("me", code, { token: seat.token });
    expect(me.status).toBe(200);
    expect(me.body.playerId).toBe(seat.playerId);
    views.push(me.body as unknown as MeResponse);
  }
  views.forEach((view, i) => {
    const others = seats.flatMap((_, j) => (j === i ? [] : (TRUTHS[j] ?? [])));
    for (const truth of others) expect(JSON.stringify(view)).not.toContain(truth);
  });
  return views;
}

async function playToEnd(code: string, seats: Seat[]) {
  for (let step = 0; step < 400; step++) {
    const room = publicRoom(code);
    if (room.phase === "gameOver") return room;

    if (room.phase === "writing") {
      for (const [i, seat] of seats.entries()) {
        if (room.players[seat.playerId]?.ready) continue;
        const truths = TRUTHS[i];
        const draft = await call("draft", code, { token: seat.token, body: { truths } });
        expect(draft.status).toBe(200);
        expect(draft.body.source).toBe("ai");
        expect((draft.body.candidates as string[]).length).toBe(room.settings.lieOptions);
        const lie = i % 2 === 0 ? { kind: "ai", index: 1 } : { kind: "own", text: "I have a twin brother in Peru." };
        const card = await call("card", code, { token: seat.token, body: { truths, lie } });
        expect(card.status).toBe(200);
        await checkMe(code, seats);
      }
      continue;
    }

    if (room.phase === "guessing" && room.card) {
      let guessed = false;
      for (const seat of seats) {
        if (room.card.authorId === seat.playerId) continue;
        if (room.card.guessedIds.includes(seat.playerId)) continue;
        if (publicRoom(code).seq !== room.seq) break;
        const guess = await call("guess", code, { token: seat.token, body: { seq: room.seq, choice: 0 } });
        expect(guess.status).toBe(200);
        guessed = true;
        const views = await checkMe(code, seats);
        const after = publicRoom(code);
        views.forEach((view, i) => {
          if (i === seats.indexOf(seat)) return;
          if (after.seq === room.seq && !after.card?.guessedIds.includes(seats[i].playerId)) {
            expect(view.myGuess).toBeNull();
          }
        });
      }
      if (guessed) continue;
    }

    if (room.phaseEndsAt !== null) vi.setSystemTime(room.phaseEndsAt + 1);
    for (const seat of seats) {
      const tick = await call("tick", code, { token: seat.token, body: { seq: room.seq } });
      expect(tick.status).toBe(200);
    }
    expect(publicRoom(code).seq).toBeGreaterThan(room.seq);
  }
  throw new Error("game did not finish");
}

describe("whole games over the API", () => {
  it("plays a solo game with bots from create to game over", async () => {
    const host = await create("Solo");
    const start = await call("start", host.code, { token: host.token });
    expect(start.status).toBe(200);
    const started = publicRoom(host.code);
    expect(Object.values(started.players).filter((p) => p.isBot).length).toBeGreaterThanOrEqual(2);
    expect(started.phase).toBe("writing");

    const end = await playToEnd(host.code, [host]);
    expect(end.result).not.toBeNull();
    expect(end.round).toBeGreaterThanOrEqual(1);
    expect(seenBodies.length).toBeGreaterThan(10);
    expect(revealsSeen.length).toBeGreaterThanOrEqual(3);

    const again = await call("host", host.code, { token: host.token, body: { action: "playAgain" } });
    expect(again.status).toBe(200);
    expect(publicRoom(host.code).phase).toBe("lobby");
  });

  it("plays a two-player game", async () => {
    const host = await create("Ada");
    const guest = await join(host.code, "Bea");
    const settings = await call("settings", host.code, {
      token: host.token,
      body: { maxRounds: 1, botCount: 0, lieOptions: 4 },
    });
    expect(settings.status).toBe(200);
    expect(publicRoom(host.code).settings.lieOptions).toBe(4);

    expect((await call("start", host.code, { token: host.token })).status).toBe(200);
    const room = publicRoom(host.code);
    expect(Object.keys(room.players).sort()).toEqual([host.playerId, guest.playerId].sort());

    const end = await playToEnd(host.code, [host, guest]);
    expect(end.phase).toBe("gameOver");
    expect(end.round).toBe(1);
  });

  it("removes tokens of players who leave", async () => {
    const host = await create("Ada");
    const guest = await join(host.code, "Bea");
    expect((await call("leave", host.code, { token: guest.token })).status).toBe(200);
    expect((await call("me", host.code, { token: guest.token })).status).toBe(403);
    const third = await join(host.code, "Cid");
    const kick = await call("host", host.code, {
      token: host.token,
      body: { action: "kick", targetId: third.playerId },
    });
    expect(kick.status).toBe(200);
    expect((await call("me", host.code, { token: third.token })).status).toBe(403);
  });
});
