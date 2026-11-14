// Tests for the game rules in lib/game/engine.ts.
//
// Every room handed to the engine is deep-frozen first, so any attempt to
// change an input throws and fails the test.

import { describe, expect, it } from "vitest";
import { LIMITS } from "../lib/constants";
import {
  GameError,
  PrivateRoomSchema,
  createRoom,
  draftsLeft,
  hostAction,
  joinRoom,
  leaveRoom,
  meView,
  setDraft,
  startGame,
  submitCard,
  submitGuess,
  tick,
  updateSettings,
  type Rng,
  type RoomState,
} from "../lib/game";
import { BOTS } from "../lib/game/bots";
import {
  DEFAULT_SETTINGS,
  PublicRoomSchema,
  type ApiErrorCode,
  type Choice,
  type SettingsPatch,
  type Truths,
} from "../lib/types";

// ---------- Helpers ----------

const T0 = 1_700_000_000_000;
const HOST = "p_0";

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Freezes a room before it goes into the engine. */
const f = (s: RoomState): RoomState => deepFreeze(s);

function expectCode(run: () => unknown, code: ApiErrorCode): void {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(GameError);
  expect((thrown as GameError).code).toBe(code);
}

/** Removes what the database would drop: nulls, empty objects, empty arrays. */
function strip(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    const items = value.map(strip).filter((item) => item !== undefined);
    return items.length > 0 ? items : undefined;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const kept = strip(child);
      if (kept !== undefined) out[key] = kept;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  return value;
}

/** A room as it comes back after being stored in the database. */
function viaDatabase(s: RoomState): RoomState {
  return {
    pub: PublicRoomSchema.parse(strip(s.pub)),
    priv: PrivateRoomSchema.parse(strip(s.priv) ?? {}),
  };
}

/** Checks that the public half gives nothing away and survives storage. */
function checkPublic(s: RoomState): void {
  const { pub, priv } = s;
  const json = JSON.stringify(pub);
  if (pub.phase === "writing" || pub.phase === "guessing") {
    expect(pub.reveal).toBeNull();
    expect(json).not.toContain("lieIndex");
    expect(json).not.toContain("lieSource");
  }
  if (pub.phase === "writing") {
    expect(pub.card).toBeNull();
    for (const card of Object.values(priv.cards)) {
      for (const statement of card.statements) expect(json).not.toContain(statement);
    }
  }
  if (pub.card) {
    expect(Object.keys(pub.card).sort()).toEqual([
      "authorId",
      "botGuessAt",
      "guessedIds",
      "statements",
    ]);
  }
  expect(PublicRoomSchema.parse(JSON.parse(json))).toEqual(pub);
  expect(PublicRoomSchema.parse(strip(pub))).toEqual(pub);
}

function lobby(names: string[] = ["Ada"]): RoomState {
  let s = createRoom({ code: "ABCDE", playerId: HOST, name: names[0], avatar: "navy", now: T0 });
  names.slice(1).forEach((name, i) => {
    s = joinRoom(f(s), { playerId: `p_${i + 1}`, name, avatar: "teal", now: T0 + i + 1 });
  });
  return s;
}

function started(names: string[], seed = 1, patch?: SettingsPatch) {
  const rng = mulberry32(seed);
  let s = lobby(names);
  if (patch) s = updateSettings(f(s), { playerId: HOST, patch });
  s = startGame(f(s), { playerId: HOST, now: T0 + 100, rng });
  return { s, rng, ids: names.map((_, i) => `p_${i}`) };
}

const truthsOf = (id: string, round = 1): Truths => [
  `Round ${round}: ${id} really did the first thing`,
  `Round ${round}: ${id} has never done the second thing`,
];
const ownLieOf = (id: string, round = 1) => `Round ${round}: ${id} made this one up`;
const aiLiesOf = (id: string) => [
  `${id} lie number one from the AI`,
  `${id} lie number two from the AI`,
  `${id} lie number three from the AI`,
];

function lockOwn(s: RoomState, id: string, now: number, rng: Rng): RoomState {
  const round = s.pub.round;
  return submitCard(f(s), {
    playerId: id,
    truths: truthsOf(id, round),
    lie: { kind: "own", text: ownLieOf(id, round) },
    now,
    rng,
  });
}

function lockAi(s: RoomState, id: string, now: number, rng: Rng): RoomState {
  const truths = truthsOf(id, s.pub.round);
  const drafted = setDraft(f(s), {
    playerId: id,
    truths,
    candidates: aiLiesOf(id),
    starters: [`Ask ${id} about the first thing.`, `Ask ${id} about the second thing.`],
    source: "ai",
    now,
  });
  return submitCard(f(drafted), {
    playerId: id,
    truths,
    lie: { kind: "ai", index: 0 },
    now,
    rng,
  });
}

/** Everyone locks a card; the last one starts the first guessing phase at `now`. */
function allLock(s: RoomState, ids: string[], kind: "ai" | "own", now: number, rng: Rng) {
  for (const id of ids) s = kind === "ai" ? lockAi(s, id, now, rng) : lockOwn(s, id, now, rng);
  return s;
}

const lieOf = (s: RoomState): Choice => s.priv.cards[s.pub.card!.authorId].lieIndex;
const truthOf = (s: RoomState): Choice => ((lieOf(s) + 1) % 3) as Choice;

function guess(s: RoomState, id: string, choice: Choice, now: number, rng: Rng): RoomState {
  return submitGuess(f(s), { playerId: id, seq: s.pub.seq, choice, now, rng });
}

function skip(s: RoomState, now: number, rng: Rng): RoomState {
  return hostAction(f(s), { playerId: s.pub.hostId, action: { action: "skip" }, now, rng });
}

/** A lone host plays a whole game against bots by taking every action. */
function playSolo(seed: number, options: { database?: boolean; patch?: SettingsPatch } = {}) {
  const rng = mulberry32(seed);
  const store = (next: RoomState) => {
    const kept = options.database ? viaDatabase(next) : next;
    checkPublic(kept);
    return kept;
  };
  let now = T0;
  let s = store(lobby());
  if (options.patch) s = store(updateSettings(f(s), { playerId: HOST, patch: options.patch }));
  s = store(startGame(f(s), { playerId: HOST, now, rng }));

  let steps = 0;
  while (s.pub.phase !== "gameOver") {
    if (++steps > 500) throw new Error("the game did not finish");
    now += 1000;
    switch (s.pub.phase) {
      case "writing":
        s = store(lockOwn(s, HOST, now, rng));
        break;
      case "guessing":
        if (s.pub.card!.authorId === HOST) {
          now = Math.max(now, s.pub.phaseEndsAt!);
          s = store(tick(f(s), { seq: s.pub.seq, now, rng }));
        } else {
          s = store(guess(s, HOST, Math.floor(rng() * 3) as Choice, now, rng));
        }
        break;
      default:
        s = store(skip(s, now, rng));
    }
  }
  return s;
}

// ---------- Lobby ----------

describe("lobby", () => {
  it("creates a room in the lobby with default settings", () => {
    const s = lobby();
    expect(s.pub.phase).toBe("lobby");
    expect(s.pub.seq).toBe(0);
    expect(s.pub.round).toBe(0);
    expect(s.pub.settings).toEqual(DEFAULT_SETTINGS);
    expect(s.pub.maxBots).toBe(BOTS.length);
    expect(s.pub.phaseStartedAt).toBeNull();
    expect(s.pub.phaseEndsAt).toBeNull();
    expect(s.pub.players[HOST]).toMatchObject({ isHost: true, isBot: false, score: 0 });
    checkPublic(s);
  });

  it("refuses a taken nickname, a full room and a finished game", () => {
    let s = lobby(["Ada", "Ben"]);
    expectCode(
      () => joinRoom(f(s), { playerId: "p_9", name: "  ada ", avatar: "rose", now: T0 + 9 }),
      "name_taken",
    );
    expectCode(
      () => joinRoom(f(s), { playerId: "p_9", name: "", avatar: "rose", now: T0 + 9 }),
      "bad_request",
    );
    s = updateSettings(f(s), { playerId: HOST, patch: { maxPlayers: 2 } });
    expectCode(
      () => joinRoom(f(s), { playerId: "p_9", name: "Cy", avatar: "rose", now: T0 + 9 }),
      "room_full",
    );
    const over = playSolo(3, { patch: { maxRounds: 1 } });
    expectCode(
      () => joinRoom(f(over), { playerId: "p_9", name: "Cy", avatar: "rose", now: T0 + 9 }),
      "wrong_phase",
    );
  });

  it("lets only the host change settings, only in the lobby, within limits", () => {
    let s = lobby(["Ada", "Ben"]);
    expectCode(
      () => updateSettings(f(s), { playerId: "p_1", patch: { guessSeconds: 20 } }),
      "forbidden",
    );
    expectCode(
      () => updateSettings(f(s), { playerId: "nobody", patch: { guessSeconds: 20 } }),
      "forbidden",
    );
    expectCode(
      () => updateSettings(f(s), { playerId: HOST, patch: { guessSeconds: 5 } }),
      "bad_request",
    );
    s = updateSettings(f(s), { playerId: HOST, patch: { guessSeconds: 20, botCount: 8 } });
    expect(s.pub.settings.guessSeconds).toBe(20);
    expect(s.pub.settings.botCount).toBe(BOTS.length);
    expect(s.pub.settings.writeSeconds).toBe(DEFAULT_SETTINGS.writeSeconds);

    s = startGame(f(s), { playerId: HOST, now: T0 + 50, rng: mulberry32(1) });
    expectCode(
      () => updateSettings(f(s), { playerId: HOST, patch: { guessSeconds: 30 } }),
      "wrong_phase",
    );
  });

  it("hands the host role to the earliest human when the host leaves", () => {
    let s = lobby(["Ada", "Ben", "Cy"]);
    s = leaveRoom(f(s), { playerId: HOST, now: T0 + 20, rng: mulberry32(1) });
    expect(s.pub.players[HOST]).toBeUndefined();
    expect(s.pub.hostId).toBe("p_1");
    expect(s.pub.players.p_1.isHost).toBe(true);
    expect(s.pub.players.p_2.isHost).toBe(false);
    expectCode(
      () => leaveRoom(f(s), { playerId: HOST, now: T0 + 21, rng: mulberry32(1) }),
      "forbidden",
    );
  });

  it("lets the host remove a player but not themself", () => {
    let s = lobby(["Ada", "Ben"]);
    const rng = mulberry32(1);
    const kick = (by: string, targetId: string) =>
      hostAction(f(s), { playerId: by, action: { action: "kick", targetId }, now: T0 + 5, rng });
    expectCode(() => kick("p_1", HOST), "forbidden");
    expectCode(() => kick(HOST, HOST), "bad_request");
    expectCode(() => kick(HOST, "p_7"), "not_found");
    s = kick(HOST, "p_1");
    expect(Object.keys(s.pub.players)).toEqual([HOST]);
  });
});

// ---------- Starting ----------

describe("starting a game", () => {
  it("gives a lone host between two and all of the bots", () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const { s } = started(["Ada"], seed);
      const bots = Object.values(s.pub.players).filter((p) => p.isBot);
      expect(bots.length).toBeGreaterThanOrEqual(LIMITS.SOLO_BOT_MIN);
      expect(bots.length).toBeLessThanOrEqual(BOTS.length);
      expect(s.pub.settings.botCount).toBe(bots.length);
      expect(new Set(bots.map((b) => b.id)).size).toBe(bots.length);
      for (const bot of bots) {
        expect(bot.ready).toBe(true);
        expect(s.priv.cards[bot.id].lieSource).toBe("ai");
      }
      counts.add(bots.length);
    }
    expect(counts.size).toBeGreaterThan(1);
  });

  it("respects the host's bot count and the seats that are free", () => {
    expect(
      Object.values(started(["Ada"], 1, { botCount: 3 }).s.pub.players).filter((p) => p.isBot),
    ).toHaveLength(3);
    expect(
      Object.values(started(["Ada", "Ben"], 1).s.pub.players).filter((p) => p.isBot),
    ).toHaveLength(0);
    const tight = started(["Ada"], 1, { botCount: 4, maxPlayers: 2 }).s;
    expect(Object.keys(tight.pub.players)).toHaveLength(2);
    expect(tight.pub.settings.botCount).toBe(1);
  });

  it("begins round one in the writing phase", () => {
    const { s } = started(["Ada", "Ben"]);
    expect(s.pub.phase).toBe("writing");
    expect(s.pub.round).toBe(1);
    expect(s.pub.seq).toBe(1);
    expect(s.pub.phaseStartedAt).toBe(T0 + 100);
    expect(s.pub.phaseEndsAt).toBe(T0 + 100 + DEFAULT_SETTINGS.writeSeconds * 1000);
    checkPublic(s);
  });

  it("needs the host, the lobby and at least two players", () => {
    const s = lobby(["Ada", "Ben"]);
    const rng = mulberry32(1);
    expectCode(() => startGame(f(s), { playerId: "p_1", now: T0, rng }), "forbidden");
    const running = startGame(f(s), { playerId: HOST, now: T0, rng });
    expectCode(() => startGame(f(running), { playerId: HOST, now: T0, rng }), "wrong_phase");

    const noBots = lobby();
    noBots.pub.maxBots = 0;
    expectCode(() => startGame(f(noBots), { playerId: HOST, now: T0, rng }), "bad_request");
  });
});

// ---------- Writing ----------

describe("writing", () => {
  it("limits lie requests and trims the options to the host's setting", () => {
    const { ids, ...rest } = started(["Ada", "Ben"]);
    let s = rest.s;
    const ask = () =>
      setDraft(f(s), {
        playerId: ids[0],
        truths: truthsOf(ids[0]),
        candidates: ["one lie here", "two lies here", "three lies here", "four lies", "five lies"],
        starters: ["Ask about it."],
        source: "ai",
        now: T0 + 200,
      });
    expect(draftsLeft(f(s), ids[0])).toBe(3);
    s = ask();
    expect(s.priv.drafts[ids[0]].candidates).toHaveLength(DEFAULT_SETTINGS.lieOptions);
    expect(draftsLeft(f(s), ids[0])).toBe(2);
    s = ask();
    s = ask();
    expect(draftsLeft(f(s), ids[0])).toBe(0);
    expectCode(ask, "rate_limited");
    expect(meView(f(s), ids[0]).draft).toMatchObject({ source: "ai", draftsLeft: 0 });
    expectCode(() => draftsLeft(f(s), "bot_pip"), "forbidden");
  });

  it("rejects cards that break the rules", () => {
    const { s, rng, ids } = started(["Ada", "Ben"]);
    const [a] = ids;
    const card = (truths: Truths, lie: Parameters<typeof submitCard>[1]["lie"]) =>
      submitCard(f(s), { playerId: a, truths, lie, now: T0 + 200, rng });

    expectCode(() => card(["too short", "x"], { kind: "own", text: ownLieOf(a) }), "bad_request");
    expectCode(
      () => card(["The very same truth", "the very SAME truth"], { kind: "own", text: ownLieOf(a) }),
      "bad_request",
    );
    expectCode(
      () => card(truthsOf(a), { kind: "own", text: truthsOf(a)[0].toUpperCase() }),
      "bad_request",
    );
    // An AI lie needs a draft made from the same truths.
    expectCode(() => card(truthsOf(a), { kind: "ai", index: 0 }), "bad_request");
    const drafted = setDraft(f(s), {
      playerId: a,
      truths: truthsOf(a),
      candidates: aiLiesOf(a),
      starters: [],
      source: "ai",
      now: T0 + 200,
    });
    const aiCard = (truths: Truths, index: number) =>
      submitCard(f(drafted), { playerId: a, truths, lie: { kind: "ai", index }, now: T0 + 300, rng });
    expectCode(() => aiCard(truthsOf(a), 3), "bad_request");
    expectCode(() => aiCard(truthsOf("someone else"), 0), "bad_request");

    const locked = aiCard(truthsOf(a), 1);
    expect(locked.pub.players[a].ready).toBe(true);
    expect(locked.priv.cards[a].statements).toContain(aiLiesOf(a)[1]);
    expect(meView(f(locked), a).card).toEqual({
      lieIndex: locked.priv.cards[a].lieIndex,
      lieSource: "ai",
    });
    expectCode(() => lockOwn(locked, a, T0 + 400, rng), "wrong_phase");
    expectCode(() => draftsLeft(f(locked), a), "wrong_phase");
  });

  it("blocks own lies when the host turned them off, unless the AI gave nothing", () => {
    const { s: base, rng, ids } = started(["Ada", "Ben"], 1, { allowOwnLie: false });
    const [a, b] = ids;
    let s = setDraft(f(base), {
      playerId: a,
      truths: truthsOf(a),
      candidates: aiLiesOf(a),
      starters: [],
      source: "ai",
      now: T0 + 200,
    });
    expectCode(() => lockOwn(s, a, T0 + 300, rng), "forbidden");

    s = setDraft(f(s), {
      playerId: b,
      truths: truthsOf(b),
      candidates: ["ignored because the AI was unavailable"],
      starters: [],
      source: "unavailable",
      now: T0 + 200,
    });
    expect(s.priv.drafts[b].candidates).toEqual([]);
    s = lockOwn(s, b, T0 + 300, rng);
    expect(s.priv.cards[b].lieSource).toBe("own");
    expect(s.priv.cards[b].starter).toContain("Ask Ben about this:");
  });

  it("moves on as soon as every human has locked a card", () => {
    const { s: base, rng, ids } = started(["Ada", "Ben"]);
    let s = lockOwn(base, ids[0], T0 + 500, rng);
    expect(s.pub.phase).toBe("writing");
    checkPublic(s);
    s = lockAi(s, ids[1], T0 + 900, rng);
    expect(s.pub.phase).toBe("guessing");
    expect([...s.pub.order].sort()).toEqual([...ids].sort());
    expect(s.pub.cardIndex).toBe(0);
    expect(s.pub.card!.authorId).toBe(s.pub.order[0]);
    expect(s.pub.phaseStartedAt).toBe(T0 + 900);
    expect(s.pub.phaseEndsAt).toBe(T0 + 900 + DEFAULT_SETTINGS.guessSeconds * 1000);
    checkPublic(s);
  });

  it("picks the first AI lie for a player who ran out of time", () => {
    const { s: base, rng, ids } = started(["Ada", "Ben"]);
    const [a, b] = ids;
    let s = setDraft(f(base), {
      playerId: a,
      truths: truthsOf(a),
      candidates: aiLiesOf(a),
      starters: ["Ask Ada about the first thing."],
      source: "ai",
      now: T0 + 200,
    });
    s = tick(f(s), { seq: s.pub.seq, now: s.pub.phaseEndsAt!, rng });
    expect(s.pub.phase).toBe("guessing");
    expect(s.pub.order).toEqual([a]);
    expect(s.priv.cards[a]).toMatchObject({
      lieSource: "ai",
      starter: "Ask Ada about the first thing.",
    });
    expect(s.priv.cards[a].statements).toContain(aiLiesOf(a)[0]);
    expect(s.pub.players[a].ready).toBe(true);
    expect(s.pub.players[b].ready).toBe(false);
  });

  it("goes straight to the round end when nobody wrote a card", () => {
    const { s: base, rng } = started(["Ada", "Ben"]);
    const s = tick(f(base), { seq: base.pub.seq, now: base.pub.phaseEndsAt!, rng });
    expect(s.pub.phase).toBe("roundEnd");
    expect(s.pub.order).toEqual([]);
    expect(s.pub.phaseEndsAt).toBe(base.pub.phaseEndsAt! + LIMITS.ROUND_END_SECONDS * 1000);
    checkPublic(s);
  });
});

// ---------- Scoring ----------

describe("scoring", () => {
  function firstCard(kind: "ai" | "own", names = ["Ada", "Ben", "Cy"], patch?: SettingsPatch) {
    const { s: base, rng, ids } = started(names, 1, patch);
    const shownAt = T0 + 1000;
    const s = allLock(base, ids, kind, shownAt, rng);
    const author = s.pub.card!.authorId;
    return { s, rng, shownAt, author, others: ids.filter((id) => id !== author) };
  }

  it("pays a correct guess with a speed bonus, charges a wrong one, and pays the author for an AI lie", () => {
    const { s: base, rng, shownAt, author, others } = firstCard("ai");
    const [y, z] = others;
    let s = guess(base, y, lieOf(base), shownAt + 15_000, rng);
    expect(s.pub.phase).toBe("guessing");
    expect(s.pub.card!.guessedIds).toEqual([y]);
    expect(meView(f(s), y).myGuess).toBe(lieOf(base));
    checkPublic(s);

    s = guess(s, z, truthOf(base), shownAt + 20_000, rng);
    expect(s.pub.phase).toBe("reveal");
    expect(s.pub.reveal).toEqual({
      lieIndex: lieOf(base),
      lieSource: "ai",
      picks: { [y]: lieOf(base), [z]: truthOf(base) },
      // Half the time left: 100 + half of the 50 bonus. One player fooled by an
      // AI lie: 50 x 1.5. Half the guessers spotted it, so it was not "too easy".
      deltas: { [y]: 125, [z]: -50, [author]: 75 },
      starter: s.priv.cards[author].starter,
    });
    expect(s.pub.players[y]).toMatchObject({ score: 125, cracks: 0 });
    expect(s.pub.players[z]).toMatchObject({ score: 0, cracks: 1 });
    expect(s.pub.players[author]).toMatchObject({ score: 75, cracks: 0 });
    expect(s.pub.phaseEndsAt).toBe(shownAt + 20_000 + DEFAULT_SETTINGS.revealSeconds * 1000);
    expect(s.priv.stats[y].correct).toBe(1);
    expect(s.priv.stats[author].fooled).toBe(1);
    expect(s.priv.learned.map((entry) => entry.truth)).toEqual(truthsOf(author));
    checkPublic(s);
  });

  it("charges the author when the lie was too easy, and never goes below zero", () => {
    const { s: base, rng, shownAt, author, others } = firstCard("own");
    let s = guess(base, others[0], lieOf(base), shownAt, rng);
    s = guess(s, others[1], lieOf(base), shownAt, rng);
    expect(s.pub.reveal!.lieSource).toBe("own");
    expect(s.pub.reveal!.deltas).toEqual({ [others[0]]: 150, [others[1]]: 150, [author]: -50 });
    expect(s.pub.players[author]).toMatchObject({ score: 0, cracks: 1 });
    for (const player of Object.values(s.pub.players)) {
      expect(player.score).toBeGreaterThanOrEqual(0);
    }
  });

  it("treats no answer as a loss that does not count as fooled", () => {
    const { s: base, rng, shownAt, author, others } = firstCard("ai");
    const [y, z] = others;
    let s = guess(base, y, lieOf(base), shownAt, rng);
    s = tick(f(s), { seq: s.pub.seq, now: s.pub.phaseEndsAt!, rng });
    expect(s.pub.phase).toBe("reveal");
    expect(s.pub.reveal!.picks).toEqual({ [y]: lieOf(base) });
    expect(s.pub.reveal!.deltas).toEqual({ [y]: 150, [z]: -50, [author]: 0 });
    expect(s.pub.players[z].cracks).toBe(1);
    expect(s.priv.stats[author].fooled).toBe(0);
  });

  it("pays an own lie without the AI bonus and drops the speed bonus when it is off", () => {
    const { s: base, rng, shownAt, author, others } = firstCard("own", undefined, {
      speedBonus: false,
    });
    let s = guess(base, others[0], lieOf(base), shownAt, rng);
    s = guess(s, others[1], truthOf(base), shownAt + 1000, rng);
    expect(s.pub.reveal!.deltas).toEqual({ [others[0]]: 100, [others[1]]: -50, [author]: 50 });
  });

  it("applies the too-easy rule at exactly the threshold", () => {
    // Five guessers, three right: exactly 60%.
    const names = ["Ada", "Ben", "Cy", "Dee", "Eli", "Fay"];
    const { s: base, rng, shownAt, author, others } = firstCard("own", names);
    let s = base;
    others.forEach((id, i) => {
      s = guess(s, id, i < 3 ? lieOf(base) : truthOf(base), shownAt, rng);
    });
    // Two fooled: 100. Too easy: -50.
    expect(s.pub.reveal!.deltas[author]).toBe(50);
    expect(s.pub.players[author].cracks).toBe(1);

    const strict = firstCard("own", names, { easyThresholdPct: 65 });
    let t = strict.s;
    strict.others.forEach((id, i) => {
      t = guess(t, id, i < 3 ? lieOf(strict.s) : truthOf(strict.s), strict.shownAt, strict.rng);
    });
    expect(t.pub.reveal!.deltas[strict.author]).toBe(100);
    expect(t.pub.players[strict.author].cracks).toBe(0);
  });

  it("gives no cracks when a penalty is set to zero", () => {
    const { s: base, rng, shownAt, author, others } = firstCard("own", undefined, {
      penaltyWrong: 0,
      penaltyEasy: 0,
    });
    let s = guess(base, others[0], truthOf(base), shownAt, rng);
    s = guess(s, others[1], truthOf(base), shownAt, rng);
    expect(s.pub.reveal!.deltas).toEqual({ [others[0]]: 0, [others[1]]: 0, [author]: 100 });
    expect(Object.values(s.pub.players).map((p) => p.cracks)).toEqual([0, 0, 0]);
  });

  it("cracks the ice on every loss and splashes at three", () => {
    const names = ["Ada", "Ben", "Cy", "Dee"];
    const { s: base, rng, ids } = started(names);
    const unlucky = ids[3];
    let now = T0 + 1000;
    let s = allLock(base, ids, "own", now, rng);

    while (s.pub.phase === "guessing") {
      const author = s.pub.card!.authorId;
      const shown = s;
      for (const id of ids.filter((other) => other !== author)) {
        now += 100;
        s = guess(s, id, id === unlucky ? truthOf(shown) : lieOf(shown), now, rng);
      }
      expect(s.pub.phase).toBe("reveal");
      now += 100;
      s = skip(s, now, rng);
    }

    expect(s.pub.phase).toBe("roundEnd");
    // Dee guessed wrong three times and wrote a lie everyone spotted.
    expect(s.pub.players[unlucky].cracks).toBe(4);
    // The others were each fooled by nobody but Dee: 2 of 3 spotted it.
    for (const id of ids.slice(0, 3)) expect(s.pub.players[id].cracks).toBe(1);
    expect(s.pub.roundSummary!.splashedIds).toEqual([unlucky]);
    for (const id of ids) {
      expect(s.pub.roundSummary!.deltas[id]).toBe(s.pub.players[id].score);
    }
    expect(s.pub.card).toBeNull();
    expect(s.pub.reveal).toBeNull();
    checkPublic(s);

    const before = Object.fromEntries(ids.map((id) => [id, s.pub.players[id].score]));
    s = skip(s, now + 100, rng);
    expect(s.pub.phase).toBe("writing");
    expect(s.pub.round).toBe(2);
    expect(s.pub.roundSummary).toBeNull();
    for (const id of ids) {
      expect(s.pub.players[id]).toMatchObject({ cracks: 0, ready: false, score: before[id] });
      expect(s.priv.roundStart[id]).toBe(before[id]);
    }
    expect(s.priv.cards).toEqual({});
    expect(s.priv.drafts).toEqual({});
  });
});

// ---------- Guessing and timers ----------

describe("guessing and timers", () => {
  function atFirstCard() {
    const { s: base, rng, ids } = started(["Ada", "Ben", "Cy"]);
    const s = allLock(base, ids, "own", T0 + 1000, rng);
    const author = s.pub.card!.authorId;
    return { s, rng, author, others: ids.filter((id) => id !== author) };
  }

  it("rejects stale, repeated and out-of-place guesses", () => {
    const { s, rng, author, others } = atFirstCard();
    const send = (room: RoomState, playerId: string, seq: number, choice: Choice) =>
      submitGuess(f(room), { playerId, seq, choice, now: T0 + 2000, rng });

    expectCode(() => send(s, others[0], s.pub.seq - 1, 0), "stale");
    expectCode(() => send(s, author, s.pub.seq, 0), "forbidden");
    expectCode(() => send(s, "nobody", s.pub.seq, 0), "forbidden");
    expectCode(() => send(s, others[0], s.pub.seq, 3 as Choice), "bad_request");
    const once = send(s, others[0], s.pub.seq, 0);
    expectCode(() => send(once, others[0], once.pub.seq, 1), "bad_request");

    const revealed = send(once, others[1], once.pub.seq, 1);
    expect(revealed.pub.phase).toBe("reveal");
    expectCode(() => send(revealed, others[0], once.pub.seq, 0), "stale");
    expectCode(() => send(revealed, others[0], revealed.pub.seq, 0), "wrong_phase");
  });

  it("returns the same room for a tick that is early, stale or on hold", () => {
    const { s, rng, others } = atFirstCard();
    const endsAt = s.pub.phaseEndsAt!;
    const frozen = f(s);
    expect(tick(frozen, { seq: s.pub.seq, now: endsAt - 5000, rng })).toBe(frozen);
    expect(tick(frozen, { seq: s.pub.seq, now: endsAt - LIMITS.TICK_GRACE_MS - 1, rng })).toBe(
      frozen,
    );
    expect(tick(frozen, { seq: s.pub.seq - 1, now: endsAt + 5000, rng })).toBe(frozen);
    const lobbyRoom = f(lobby());
    expect(tick(lobbyRoom, { seq: 0, now: T0 + 999_999, rng })).toBe(lobbyRoom);

    // Within the grace period the tick counts.
    const onTime = tick(frozen, { seq: s.pub.seq, now: endsAt - LIMITS.TICK_GRACE_MS, rng });
    expect(onTime).not.toBe(frozen);
    expect(onTime.pub.phase).toBe("reveal");
    expect(onTime.pub.seq).toBe(s.pub.seq + 1);
    // Both humans were silent: no picks at all.
    expect(onTime.pub.reveal!.picks).toEqual({});
    expect(onTime.pub.reveal!.deltas[others[0]]).toBe(-50);

    const hold = (room: RoomState, by: string, now: number) =>
      hostAction(f(room), { playerId: by, action: { action: "hold" }, now, rng });
    expectCode(() => hold(s, HOST, endsAt), "wrong_phase");
    expectCode(() => hold(onTime, others[0] === HOST ? others[1] : others[0], endsAt), "forbidden");
    const held = f(hold(onTime, HOST, endsAt + 1000));
    expect(held.pub.held).toBe(true);
    expect(held.pub.phaseEndsAt).toBeNull();
    expect(held.pub.seq).toBe(onTime.pub.seq);
    expect(tick(held, { seq: held.pub.seq, now: endsAt + 999_999, rng })).toBe(held);
    const resumed = hold(held, HOST, endsAt + 60_000);
    expect(resumed.pub.held).toBe(false);
    expect(resumed.pub.phaseEndsAt).toBe(endsAt + 60_000 + DEFAULT_SETTINGS.revealSeconds * 1000);
    checkPublic(resumed);
  });

  it("walks through every card and ends the round", () => {
    const { s: first, rng } = atFirstCard();
    let s = first;
    const shown: string[] = [];
    while (s.pub.phase !== "roundEnd") {
      if (s.pub.phase === "guessing") shown.push(s.pub.card!.authorId);
      checkPublic(s);
      s = tick(f(s), { seq: s.pub.seq, now: s.pub.phaseEndsAt!, rng });
    }
    expect(shown).toEqual(first.pub.order);
    expect(s.pub.cardIndex).toBe(2);
    expect(s.priv.learned).toHaveLength(6);
    expectCode(
      () => hostAction(f(lobby()), { playerId: HOST, action: { action: "skip" }, now: T0, rng }),
      "wrong_phase",
    );
  });

  it("plans a guess for every bot and waits only for them on a solo player's own card", () => {
    const { s: base, rng } = started(["Ada"], 5, { botCount: 3 });
    let s = lockOwn(base, HOST, T0 + 1000, rng);
    let now = T0 + 1000;
    let sawOwnCard = false;
    while (s.pub.phase === "guessing" || s.pub.phase === "reveal") {
      if (s.pub.phase === "reveal") {
        now += 500;
        s = skip(s, now, rng);
        continue;
      }
      const card = s.pub.card!;
      const shownAt = s.pub.phaseStartedAt!;
      const botIds = Object.values(s.pub.players)
        .filter((p) => p.isBot && p.id !== card.authorId)
        .map((p) => p.id);
      expect(Object.keys(card.botGuessAt).sort()).toEqual([...botIds].sort());
      expect(Object.keys(s.priv.botPlan).sort()).toEqual([...botIds].sort());
      if (card.authorId === HOST) {
        sawOwnCard = true;
        for (const at of Object.values(card.botGuessAt)) {
          expect(at).toBeGreaterThanOrEqual(shownAt + 1500);
          expect(at).toBeLessThanOrEqual(shownAt + 6000);
        }
        expect(s.pub.phaseEndsAt).toBe(Math.max(...Object.values(card.botGuessAt)) + 600);
        now = s.pub.phaseEndsAt!;
        s = tick(f(s), { seq: s.pub.seq, now, rng });
        // Every bot answered, so every bot has a pick.
        expect(Object.keys(s.pub.reveal!.picks).sort()).toEqual([...botIds].sort());
      } else {
        for (const at of Object.values(card.botGuessAt)) {
          expect(at).toBeGreaterThanOrEqual(shownAt + 2000);
          expect(at).toBeLessThanOrEqual(shownAt + DEFAULT_SETTINGS.guessSeconds * 800);
        }
        expect(s.pub.phaseEndsAt).toBe(shownAt + DEFAULT_SETTINGS.guessSeconds * 1000);
        now += 500;
        // The only human answers, so the reveal does not wait for the bots.
        s = guess(s, HOST, lieOf(s), now, rng);
        expect(s.pub.phase).toBe("reveal");
        expect(Object.keys(s.pub.reveal!.picks)).toHaveLength(botIds.length + 1);
      }
    }
    expect(sawOwnCard).toBe(true);
    expect(s.pub.phase).toBe("roundEnd");
  });
});

// ---------- Joining and leaving mid-game ----------

describe("joining and leaving mid-game", () => {
  it("lets a late joiner guess from the next card, with no loss on the current one", () => {
    const { s: base, rng, ids } = started(["Ada", "Ben"]);
    let s = allLock(base, ids, "own", T0 + 1000, rng);
    const firstAuthor = s.pub.card!.authorId;
    const firstGuesser = ids.find((id) => id !== firstAuthor)!;

    s = joinRoom(f(s), { playerId: "p_late", name: "Lu", avatar: "mint", now: T0 + 5000 });
    expect(s.pub.players.p_late).toMatchObject({ ready: false, score: 0, isHost: false });
    expect(s.priv.roundStart.p_late).toBe(0);
    expectCode(() => guess(s, "p_late", 0, T0 + 6000, rng), "forbidden");

    s = guess(s, firstGuesser, lieOf(s), T0 + 7000, rng);
    expect(s.pub.phase).toBe("reveal");
    expect(s.pub.reveal!.deltas.p_late).toBeUndefined();
    expect(s.pub.players.p_late.cracks).toBe(0);

    s = skip(s, T0 + 8000, rng);
    expect(s.pub.phase).toBe("guessing");
    s = guess(s, firstAuthor, lieOf(s), T0 + 9000, rng);
    expect(s.pub.phase).toBe("guessing");
    s = guess(s, "p_late", lieOf(s), T0 + 9500, rng);
    expect(s.pub.phase).toBe("reveal");
    expect(s.pub.reveal!.deltas.p_late).toBeGreaterThan(0);
  });

  it("lets someone who joins during writing write a card that round", () => {
    const { s: base, rng, ids } = started(["Ada", "Ben"]);
    let s = joinRoom(f(base), { playerId: "p_late", name: "Lu", avatar: "mint", now: T0 + 500 });
    s = allLock(s, ids, "own", T0 + 1000, rng);
    expect(s.pub.phase).toBe("writing");
    s = lockOwn(s, "p_late", T0 + 2000, rng);
    expect(s.pub.phase).toBe("guessing");
    expect(s.pub.order).toHaveLength(3);
  });

  it("drops a card whose author leaves and carries on", () => {
    const { s: base, rng, ids } = started(["Ada", "Ben", "Cy"]);
    let s = allLock(base, ids, "own", T0 + 1000, rng);
    const [first, second, third] = s.pub.order;
    s = leaveRoom(f(s), { playerId: first, now: T0 + 2000, rng });
    expect(s.pub.players[first]).toBeUndefined();
    expect(s.pub.order).toEqual([second, third]);
    expect(s.pub.phase).toBe("guessing");
    expect(s.pub.cardIndex).toBe(0);
    expect(s.pub.card!.authorId).toBe(second);
    expect(s.pub.players[s.pub.hostId].isHost).toBe(true);
    expect(Object.values(s.pub.players).filter((p) => p.isHost)).toHaveLength(1);
    // Nothing was scored for the dropped card.
    expect(Object.values(s.pub.players).map((p) => p.score)).toEqual([0, 0]);
    checkPublic(s);

    // A player still to come leaves: their card is skipped.
    s = leaveRoom(f(s), { playerId: third, now: T0 + 3000, rng });
    expect(s.pub.order).toEqual([second]);
    // The author is the only one left, so nobody is left to wait for.
    expect(s.pub.phase).toBe("reveal");
    s = tick(f(s), { seq: s.pub.seq, now: s.pub.phaseEndsAt!, rng });
    expect(s.pub.phase).toBe("roundEnd");
  });

  it("reveals when the last player still guessing leaves, and ends writing when the last writer leaves", () => {
    const { s: base, rng, ids } = started(["Ada", "Ben", "Cy"]);
    const waiting = lockOwn(lockOwn(base, ids[0], T0 + 500, rng), ids[1], T0 + 600, rng);
    expect(waiting.pub.phase).toBe("writing");
    let s = leaveRoom(f(waiting), { playerId: ids[2], now: T0 + 700, rng });
    expect(s.pub.phase).toBe("guessing");
    expect(s.pub.order).toHaveLength(2);

    const { s: again, rng: rng2, ids: ids2 } = started(["Ada", "Ben", "Cy"], 2);
    s = allLock(again, ids2, "own", T0 + 1000, rng2);
    const author = s.pub.card!.authorId;
    const [y, z] = ids2.filter((id) => id !== author);
    s = guess(s, y, lieOf(s), T0 + 2000, rng2);
    s = leaveRoom(f(s), { playerId: z, now: T0 + 3000, rng: rng2 });
    expect(s.pub.phase).toBe("reveal");
    expect(Object.keys(s.pub.reveal!.deltas).sort()).toEqual([author, y].sort());
  });

  it("keeps the room when the last human leaves", () => {
    const { s: base, rng } = started(["Ada"], 1, { botCount: 2 });
    const s = leaveRoom(f(base), { playerId: HOST, now: T0 + 500, rng });
    expect(Object.values(s.pub.players).every((p) => p.isBot)).toBe(true);
    expect(s.pub.phase).toBe("writing");
  });
});

// ---------- Whole games ----------

describe("whole games", () => {
  it("finishes a solo game on timers alone", () => {
    for (const seed of [1, 2, 3]) {
      const rng = mulberry32(seed);
      let s = startGame(f(lobby()), { playerId: HOST, now: T0, rng });
      let steps = 0;
      while (s.pub.phase !== "gameOver") {
        if (++steps > 500) throw new Error("the game did not finish");
        checkPublic(s);
        const next = tick(f(s), { seq: s.pub.seq, now: s.pub.phaseEndsAt!, rng });
        expect(next.pub.seq).toBe(s.pub.seq + 1);
        s = next;
      }
      checkPublic(s);
      expect(s.pub.round).toBeLessThanOrEqual(DEFAULT_SETTINGS.maxRounds);
      expect(s.pub.phaseEndsAt).toBeNull();
      expect(s.pub.result!.winnerIds.length).toBeGreaterThan(0);
      // The silent host only ever lost points.
      expect(s.pub.players[HOST].score).toBe(0);
    }
  });

  it("finishes a solo game played by hand and names the winners", () => {
    const s = playSolo(7);
    const result = s.pub.result!;
    const top = Math.max(...Object.values(s.pub.players).map((p) => p.score));
    expect(
      top >= s.pub.settings.targetScore || s.pub.round === s.pub.settings.maxRounds,
    ).toBe(true);
    expect([...result.winnerIds].sort()).toEqual(
      Object.values(s.pub.players)
        .filter((p) => p.score === top)
        .map((p) => p.id)
        .sort(),
    );
    const most = (key: "fooled" | "correct") =>
      Math.max(...Object.values(s.priv.stats).map((stats) => stats[key]));
    expect(s.priv.stats[result.bestLiarId!].fooled).toBe(most("fooled"));
    expect(s.priv.stats[result.sharpestEyeId!].correct).toBe(most("correct"));
    expect(result.learned.length).toBeGreaterThan(0);
    expect(result.learned.length).toBeLessThanOrEqual(LIMITS.LEARNED_MAX);
    expect(result.learned).toEqual(s.priv.learned);
  });

  it("ends as soon as a round finishes with someone at the target score", () => {
    const s = playSolo(11, { patch: { targetScore: 300, maxRounds: 5, botCount: 4 } });
    const top = Math.max(...Object.values(s.pub.players).map((p) => p.score));
    if (s.pub.round < 5) expect(top).toBeGreaterThanOrEqual(300);
    expect(s.pub.round).toBeGreaterThanOrEqual(1);
  });

  it("keeps working when every step goes through the database", () => {
    for (const seed of [21, 22]) {
      const s = playSolo(seed, { database: true, patch: { maxRounds: 5, targetScore: 5000 } });
      // Five rounds use each bot's four cards and force a reshuffle.
      expect(s.pub.round).toBe(5);
      expect(s.pub.phase).toBe("gameOver");
    }
  });

  it("gives the same game for the same seed", () => {
    expect(playSolo(42)).toEqual(playSolo(42));
  });

  it("returns to the lobby with the same humans on play again", () => {
    const over = playSolo(9, { patch: { maxRounds: 1 } });
    const rng = mulberry32(9);
    const again = (room: RoomState, by = HOST) =>
      hostAction(f(room), { playerId: by, action: { action: "playAgain" }, now: T0 + 90_000, rng });
    expectCode(() => again(lobby()), "wrong_phase");
    expectCode(() => again(over, "bot_pip"), "forbidden");

    const s = again(over);
    expect(s.pub.phase).toBe("lobby");
    expect(s.pub.seq).toBe(over.pub.seq + 1);
    expect(Object.keys(s.pub.players)).toEqual([HOST]);
    expect(s.pub.players[HOST]).toMatchObject({ score: 0, cracks: 0, ready: false, isHost: true });
    expect(s.pub).toMatchObject({
      round: 0,
      order: [],
      card: null,
      reveal: null,
      roundSummary: null,
      result: null,
      phaseEndsAt: null,
      phaseStartedAt: null,
    });
    expect(s.priv).toEqual(PrivateRoomSchema.parse({}));
    checkPublic(s);

    const restarted = startGame(f(s), { playerId: HOST, now: T0 + 95_000, rng });
    expect(restarted.pub.phase).toBe("writing");
    expect(restarted.pub.round).toBe(1);
  });
});

// ---------- Private view ----------

describe("meView", () => {
  it("shows a player only their own secrets", () => {
    const { s: base, rng, ids } = started(["Ada", "Ben"]);
    expect(meView(f(base), ids[0])).toEqual({
      playerId: ids[0],
      isHost: true,
      draft: null,
      card: null,
      myGuess: null,
    });
    expect(meView(f(base), ids[1]).isHost).toBe(false);
    expectCode(() => meView(f(base), "nobody"), "forbidden");

    const s = allLock(base, ids, "ai", T0 + 1000, rng);
    const view = meView(f(s), ids[0]);
    expect(view.draft).toEqual({
      truths: truthsOf(ids[0]),
      candidates: aiLiesOf(ids[0]),
      source: "ai",
      draftsLeft: 2,
    });
    expect(view.card).toEqual({ lieIndex: s.priv.cards[ids[0]].lieIndex, lieSource: "ai" });
    expect(view.myGuess).toBeNull();
  });
});
