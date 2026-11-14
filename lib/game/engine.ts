// The rules of Thin Ice as pure functions.
//
// The same code runs in two places: in the browser for the mock driver, and
// on the server inside a database transaction. So nothing here reads a clock,
// rolls its own dice or does I/O. Time comes in as `now` (ms) and randomness
// as `rng`. Every exported function takes a room and returns a new one; the
// room passed in is never changed.
//
// Phases: lobby -> writing -> (guessing -> reveal) per card -> roundEnd ->
// writing again or gameOver.

import { LIMITS } from "../constants";
import {
  AvatarSchema,
  ChoiceSchema,
  DEFAULT_SETTINGS,
  HostActionSchema,
  NameSchema,
  SettingsSchema,
  StatementSchema,
  TruthsSchema,
  describeIssues,
  type ApiErrorCode,
  type Avatar,
  type Choice,
  type DraftSource,
  type HostAction,
  type LieChoice,
  type LieSource,
  type MeResponse,
  type Player,
  type PublicRoom,
  type SettingsPatch,
  type Truths,
} from "../types";
import { BOTS } from "./bots";
import {
  emptyPrivate,
  type PrivateCard,
  type PrivateStats,
  type RoomState,
} from "./private";

export class GameError extends Error {
  code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = "GameError";
    this.code = code;
  }
}

/** Returns a number from 0 (inclusive) to 1 (exclusive), like Math.random. */
export type Rng = () => number;

// ---------- Small helpers ----------

function fail(code: ApiErrorCode, message: string): never {
  throw new GameError(code, message);
}

function clone(s: RoomState): RoomState {
  return structuredClone(s);
}

/** Own-property lookup, so an id like "constructor" can never match. */
function get<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function randInt(rng: Rng, min: number, max: number): number {
  if (max <= min) return min;
  return Math.min(max, min + Math.floor(rng() * (max - min + 1)));
}

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const sameText = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/** Players in a fixed order (join time, then id), whatever the key order is. */
function playerList(pub: PublicRoom): Player[] {
  return Object.values(pub.players).sort(
    (a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

function humanList(pub: PublicRoom): Player[] {
  return playerList(pub).filter((p) => !p.isBot);
}

function requirePlayer(s: RoomState, playerId: string): Player {
  const player = get(s.pub.players, playerId);
  if (!player) fail("forbidden", "You are not in this room.");
  return player;
}

function requireHost(s: RoomState, playerId: string): Player {
  const player = requirePlayer(s, playerId);
  if (s.pub.hostId !== playerId) fail("forbidden", "Only the host can do that.");
  return player;
}

function cleanName(name: string): string {
  const parsed = NameSchema.safeParse(name);
  if (!parsed.success) {
    fail("bad_request", `Pick a nickname of 1 to ${LIMITS.NAME_MAX} characters.`);
  }
  return parsed.data;
}

function cleanAvatar(avatar: Avatar): Avatar {
  const parsed = AvatarSchema.safeParse(avatar);
  if (!parsed.success) fail("bad_request", "Unknown penguin colour.");
  return parsed.data;
}

function cleanTruths(truths: Truths): Truths {
  const parsed = TruthsSchema.safeParse(truths);
  if (!parsed.success) {
    fail(
      "bad_request",
      `Each truth needs ${LIMITS.STATEMENT_MIN} to ${LIMITS.STATEMENT_MAX} characters.`,
    );
  }
  if (sameText(parsed.data[0], parsed.data[1])) {
    fail("bad_request", "Your two truths must be different.");
  }
  return parsed.data;
}

function statsOf(s: RoomState, playerId: string): PrivateStats {
  const existing = get(s.priv.stats, playerId);
  if (existing) return existing;
  const fresh: PrivateStats = { fooled: 0, correct: 0 };
  s.priv.stats[playerId] = fresh;
  return fresh;
}

function buildCard(
  truths: readonly [string, string],
  lie: string,
  lieSource: LieSource,
  starter: string,
  rng: Rng,
): PrivateCard {
  const parts = shuffled(
    [
      { text: truths[0], isLie: false },
      { text: truths[1], isLie: false },
      { text: lie, isLie: true },
    ],
    rng,
  );
  return {
    truths: [truths[0], truths[1]],
    statements: [parts[0].text, parts[1].text, parts[2].text],
    lieIndex: parts.findIndex((part) => part.isLie) as Choice,
    lieSource,
    starter,
  };
}

function fallbackStarter(name: string, truths: readonly [string, string], rng: Rng): string {
  return `Ask ${name} about this: "${truths[randInt(rng, 0, 1)]}"`;
}

/**
 * Who guesses on the card being shown: everyone but the author who was in the
 * room when the card came up. Someone who joins mid-card waits for the next.
 */
function guessersOf(pub: PublicRoom): Player[] {
  const card = pub.card;
  if (!card) return [];
  const shownAt = pub.phaseStartedAt ?? Number.POSITIVE_INFINITY;
  return playerList(pub).filter((p) => p.id !== card.authorId && p.joinedAt <= shownAt);
}

function allHumansGuessed(s: RoomState): boolean {
  return guessersOf(s.pub)
    .filter((p) => !p.isBot)
    .every((p) => get(s.priv.guesses, p.id) !== undefined);
}

function allHumansReady(pub: PublicRoom): boolean {
  return humanList(pub).every((p) => p.ready);
}

// ---------- Phase changes (these edit the working copy `d` in place) ----------

function beginRound(d: RoomState, now: number, rng: Rng): void {
  const { pub, priv } = d;
  pub.round += 1;
  pub.order = [];
  pub.cardIndex = 0;
  pub.card = null;
  pub.reveal = null;
  pub.roundSummary = null;
  pub.held = false;
  priv.drafts = {};
  priv.cards = {};
  priv.guesses = {};
  priv.botPlan = {};
  priv.roundStart = {};

  for (const player of playerList(pub)) {
    player.cracks = 0;
    player.ready = player.isBot;
    priv.roundStart[player.id] = player.score;
    if (!player.isBot) continue;

    const character = BOTS.find((bot) => bot.id === player.id);
    if (!character || character.cards.length === 0) continue;
    let deck = get(priv.botDecks, player.id) ?? [];
    if (deck.length === 0) deck = shuffled(character.cards.map((_, i) => i), rng);
    const index = deck[0];
    priv.botDecks[player.id] = deck.slice(1);
    const source = character.cards[index] ?? character.cards[0];
    priv.cards[player.id] = buildCard(source.truths, source.lie, "ai", source.starter, rng);
  }

  pub.phase = "writing";
  pub.phaseStartedAt = now;
  pub.phaseEndsAt = now + pub.settings.writeSeconds * 1000;
  pub.seq += 1;
}

function endWriting(d: RoomState, now: number, rng: Rng): void {
  const { pub, priv } = d;

  // A player who asked for lies but ran out of time gets the first one that works.
  for (const player of humanList(pub)) {
    if (get(priv.cards, player.id)) continue;
    const draft = get(priv.drafts, player.id);
    if (!draft) continue;
    const lie = draft.candidates.find(
      (text) => !sameText(text, draft.truths[0]) && !sameText(text, draft.truths[1]),
    );
    if (lie === undefined) continue;
    const starter =
      draft.starters.length > 0
        ? draft.starters[randInt(rng, 0, draft.starters.length - 1)]
        : fallbackStarter(player.name, draft.truths, rng);
    priv.cards[player.id] = buildCard(draft.truths, lie, "ai", starter, rng);
    player.ready = true;
  }

  const authors = playerList(pub)
    .filter((p) => get(priv.cards, p.id) !== undefined)
    .map((p) => p.id);
  pub.order = shuffled(authors, rng);
  showCardFrom(d, 0, now, rng);
}

/** Shows the first card at or after `start` whose author is still here. */
function showCardFrom(d: RoomState, start: number, now: number, rng: Rng): void {
  const { pub, priv } = d;
  for (let i = Math.max(0, start); i < pub.order.length; i++) {
    const authorId = pub.order[i];
    const secret = get(priv.cards, authorId);
    if (!get(pub.players, authorId) || !secret) continue;

    const others = playerList(pub).filter((p) => p.id !== authorId);
    const bots = others.filter((p) => p.isBot);
    const hasHumanGuesser = others.some((p) => !p.isBot);
    const guessMs = pub.settings.guessSeconds * 1000;

    priv.guesses = {};
    priv.botPlan = {};
    const botGuessAt: Record<string, number> = {};
    let latest = now;
    for (const bot of bots) {
      const choice = randInt(rng, 0, 2) as Choice;
      // With a human watching the clock, bots spread over the guess time.
      // On a solo player's own card nobody is waiting, so they answer fast.
      const at = hasHumanGuesser
        ? Math.round(now + 2000 + rng() * (guessMs * 0.8 - 2000))
        : Math.round(now + 1500 + rng() * 4500);
      priv.botPlan[bot.id] = { choice, at };
      botGuessAt[bot.id] = at;
      latest = Math.max(latest, at);
    }

    pub.cardIndex = i;
    pub.card = {
      authorId,
      statements: [secret.statements[0], secret.statements[1], secret.statements[2]],
      guessedIds: [],
      botGuessAt,
    };
    pub.reveal = null;
    pub.held = false;
    pub.phase = "guessing";
    pub.phaseStartedAt = now;
    pub.phaseEndsAt = hasHumanGuesser
      ? now + guessMs
      : bots.length > 0
        ? latest + 600
        : now + 1500;
    pub.seq += 1;
    return;
  }
  endRound(d, now);
}

function revealCard(d: RoomState, now: number, rng: Rng): void {
  const { pub, priv } = d;
  const card = pub.card;
  const secret = card ? get(priv.cards, card.authorId) : undefined;
  const author = card ? get(pub.players, card.authorId) : undefined;
  if (!card || !secret || !author) {
    showCardFrom(d, pub.cardIndex + 1, now, rng);
    return;
  }

  const settings = pub.settings;
  const startedAt = pub.phaseStartedAt ?? now;
  const endsAt = pub.phaseEndsAt ?? now;
  const span = endsAt - startedAt;
  const guessers = guessersOf(pub);
  const picks: Record<string, Choice> = {};
  const deltas: Record<string, number> = {};
  let correct = 0;
  let fooled = 0;

  for (const guesser of guessers) {
    const entry = guesser.isBot
      ? get(priv.botPlan, guesser.id)
      : get(priv.guesses, guesser.id);
    let delta: number;
    if (entry && entry.choice === secret.lieIndex) {
      const at = Math.min(entry.at, now);
      const timeLeft = span > 0 ? clamp((endsAt - at) / span, 0, 1) : 0;
      delta =
        settings.pointsCorrect +
        (settings.speedBonus ? Math.round((settings.pointsCorrect / 2) * timeLeft) : 0);
      correct += 1;
      statsOf(d, guesser.id).correct += 1;
    } else {
      // Picking a truth means being fooled; not answering does not.
      if (entry) fooled += 1;
      delta = settings.penaltyWrong > 0 ? -settings.penaltyWrong : 0;
      if (settings.penaltyWrong > 0) guesser.cracks += 1;
    }
    if (entry) picks[guesser.id] = entry.choice;
    deltas[guesser.id] = delta;
    guesser.score = Math.max(0, guesser.score + delta);
  }

  const bonusPct = secret.lieSource === "ai" ? 100 + settings.aiLieBonusPct : 100;
  let authorDelta = Math.round((fooled * settings.pointsPerFooled * bonusPct) / 100);
  const tooEasy =
    guessers.length > 0 && correct * 100 >= settings.easyThresholdPct * guessers.length;
  if (tooEasy && settings.penaltyEasy > 0) {
    authorDelta -= settings.penaltyEasy;
    author.cracks += 1;
  }
  deltas[author.id] = authorDelta;
  author.score = Math.max(0, author.score + authorDelta);
  statsOf(d, author.id).fooled += fooled;

  for (const truth of secret.truths) {
    priv.learned.push({ playerId: author.id, name: author.name, truth });
  }
  if (priv.learned.length > LIMITS.LEARNED_MAX) {
    priv.learned = priv.learned.slice(-LIMITS.LEARNED_MAX);
  }

  pub.reveal = {
    lieIndex: secret.lieIndex,
    lieSource: secret.lieSource,
    picks,
    deltas,
    starter: secret.starter,
  };
  pub.held = false;
  pub.phase = "reveal";
  pub.phaseStartedAt = now;
  pub.phaseEndsAt = now + settings.revealSeconds * 1000;
  pub.seq += 1;
}

function endRound(d: RoomState, now: number): void {
  const { pub, priv } = d;
  const players = playerList(pub);
  const deltas: Record<string, number> = {};
  for (const player of players) {
    deltas[player.id] = player.score - (get(priv.roundStart, player.id) ?? player.score);
  }
  pub.roundSummary = {
    splashedIds: players
      .filter((p) => p.cracks >= LIMITS.CRACKS_TO_SPLASH)
      .map((p) => p.id),
    deltas,
  };
  pub.card = null;
  pub.reveal = null;
  pub.held = false;
  pub.phase = "roundEnd";
  pub.phaseStartedAt = now;
  pub.phaseEndsAt = now + LIMITS.ROUND_END_SECONDS * 1000;
  pub.seq += 1;
}

function afterRoundEnd(d: RoomState, now: number, rng: Rng): void {
  const { pub } = d;
  const top = Math.max(0, ...Object.values(pub.players).map((p) => p.score));
  if (top >= pub.settings.targetScore || pub.round >= pub.settings.maxRounds) {
    endGame(d);
  } else {
    beginRound(d, now, rng);
  }
}

function endGame(d: RoomState): void {
  const { pub, priv } = d;
  const players = playerList(pub);
  const top = Math.max(0, ...players.map((p) => p.score));

  // Highest value wins; nobody wins with zero; a tie goes to who joined first.
  const best = (value: (stats: PrivateStats) => number): string | null => {
    let winner: string | null = null;
    let highest = 0;
    for (const player of players) {
      const stats = get(priv.stats, player.id);
      const score = stats ? value(stats) : 0;
      if (score > highest) {
        highest = score;
        winner = player.id;
      }
    }
    return winner;
  };

  pub.result = {
    winnerIds: players.filter((p) => p.score === top).map((p) => p.id),
    bestLiarId: best((stats) => stats.fooled),
    sharpestEyeId: best((stats) => stats.correct),
    learned: priv.learned.map((entry) => ({ ...entry })),
  };
  pub.card = null;
  pub.reveal = null;
  pub.held = false;
  pub.phase = "gameOver";
  pub.phaseStartedAt = null;
  pub.phaseEndsAt = null;
  pub.seq += 1;
}

/** Ends the current phase, as a due timer or the host's "skip" does. */
function advance(d: RoomState, now: number, rng: Rng): boolean {
  switch (d.pub.phase) {
    case "writing":
      endWriting(d, now, rng);
      return true;
    case "guessing":
      revealCard(d, now, rng);
      return true;
    case "reveal":
      showCardFrom(d, d.pub.cardIndex + 1, now, rng);
      return true;
    case "roundEnd":
      afterRoundEnd(d, now, rng);
      return true;
    default:
      return false;
  }
}

function removePlayer(d: RoomState, playerId: string, now: number, rng: Rng): void {
  const { pub, priv } = d;
  const wasHost = pub.hostId === playerId;
  const wasOnScreen =
    (pub.phase === "guessing" || pub.phase === "reveal") && pub.card?.authorId === playerId;

  delete pub.players[playerId];
  delete priv.drafts[playerId];
  delete priv.cards[playerId];
  delete priv.guesses[playerId];
  delete priv.botPlan[playerId];
  delete priv.botDecks[playerId];
  delete priv.roundStart[playerId];
  delete priv.stats[playerId];
  if (pub.card) {
    pub.card.guessedIds = pub.card.guessedIds.filter((id) => id !== playerId);
    delete pub.card.botGuessAt[playerId];
  }

  // Keep `order` free of people who are gone, and `order[cardIndex]` pointing
  // at the same card as before.
  const position = pub.order.indexOf(playerId);
  if (position !== -1) {
    pub.order.splice(position, 1);
    if (position < pub.cardIndex) pub.cardIndex -= 1;
  }

  const humans = humanList(pub);
  if (humans.length === 0) return;

  if (wasHost) {
    for (const player of Object.values(pub.players)) player.isHost = false;
    humans[0].isHost = true;
    pub.hostId = humans[0].id;
  }

  if (wasOnScreen) {
    // Their card is dropped unscored; the next one now sits at cardIndex.
    pub.card = null;
    pub.reveal = null;
    showCardFrom(d, pub.cardIndex, now, rng);
    return;
  }
  if (pub.phase === "guessing" && allHumansGuessed(d)) {
    revealCard(d, now, rng);
    return;
  }
  if (pub.phase === "writing" && allHumansReady(pub)) {
    endWriting(d, now, rng);
  }
}

// ---------- Exported actions ----------

export function createRoom(a: {
  code: string;
  playerId: string;
  name: string;
  avatar: Avatar;
  now: number;
}): RoomState {
  const name = cleanName(a.name);
  const avatar = cleanAvatar(a.avatar);
  const maxBots = BOTS.length;
  const pub: PublicRoom = {
    code: a.code,
    hostId: a.playerId,
    createdAt: a.now,
    seq: 0,
    settings: {
      ...DEFAULT_SETTINGS,
      botCount: Math.min(DEFAULT_SETTINGS.botCount, maxBots),
    },
    maxBots,
    phase: "lobby",
    phaseStartedAt: null,
    phaseEndsAt: null,
    held: false,
    round: 0,
    players: {
      [a.playerId]: {
        id: a.playerId,
        name,
        avatar,
        isBot: false,
        isHost: true,
        score: 0,
        cracks: 0,
        ready: false,
        joinedAt: a.now,
      },
    },
    order: [],
    cardIndex: 0,
    card: null,
    reveal: null,
    roundSummary: null,
    result: null,
  };
  return { pub, priv: emptyPrivate() };
}

export function joinRoom(
  s: RoomState,
  a: { playerId: string; name: string; avatar: Avatar; now: number },
): RoomState {
  if (s.pub.phase === "gameOver") {
    fail("wrong_phase", "This game is over. Ask the host to play again.");
  }
  if (get(s.pub.players, a.playerId)) fail("bad_request", "You are already in this room.");
  const name = cleanName(a.name);
  const avatar = cleanAvatar(a.avatar);
  if (Object.keys(s.pub.players).length >= s.pub.settings.maxPlayers) {
    fail("room_full", "This room is full.");
  }
  if (humanList(s.pub).some((p) => sameText(p.name, name))) {
    fail("name_taken", "Someone here already uses that nickname.");
  }

  const d = clone(s);
  d.pub.players[a.playerId] = {
    id: a.playerId,
    name,
    avatar,
    isBot: false,
    isHost: false,
    score: 0,
    cracks: 0,
    ready: false,
    joinedAt: a.now,
  };
  d.priv.roundStart[a.playerId] = 0;
  return d;
}

export function leaveRoom(
  s: RoomState,
  a: { playerId: string; now: number; rng: Rng },
): RoomState {
  requirePlayer(s, a.playerId);
  const d = clone(s);
  removePlayer(d, a.playerId, a.now, a.rng);
  return d;
}

export function updateSettings(
  s: RoomState,
  a: { playerId: string; patch: SettingsPatch },
): RoomState {
  requireHost(s, a.playerId);
  if (s.pub.phase !== "lobby") {
    fail("wrong_phase", "Settings can only change in the lobby.");
  }
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(a.patch ?? {})) {
    if (value !== undefined) patch[key] = value;
  }
  const parsed = SettingsSchema.safeParse({ ...s.pub.settings, ...patch });
  if (!parsed.success) {
    fail("bad_request", `Invalid settings: ${describeIssues(parsed.error)}`);
  }
  const d = clone(s);
  d.pub.settings = {
    ...parsed.data,
    botCount: Math.min(parsed.data.botCount, d.pub.maxBots),
  };
  return d;
}

export function startGame(
  s: RoomState,
  a: { playerId: string; now: number; rng: Rng },
): RoomState {
  requireHost(s, a.playerId);
  if (s.pub.phase !== "lobby") fail("wrong_phase", "The game has already started.");

  const d = clone(s);
  const { pub } = d;
  for (const player of Object.values(pub.players)) {
    if (player.isBot) delete pub.players[player.id];
  }
  const humans = humanList(pub);
  const maxBots = Math.min(pub.maxBots, BOTS.length);
  let botCount = pub.settings.botCount;
  if (humans.length === 1 && botCount < LIMITS.SOLO_BOT_MIN) {
    botCount = randInt(a.rng, LIMITS.SOLO_BOT_MIN, maxBots);
  }
  const freeSeats = pub.settings.maxPlayers - humans.length;
  botCount = Math.max(0, Math.min(botCount, maxBots, freeSeats));
  if (humans.length + botCount < 2) {
    fail("bad_request", "You need at least two players to start.");
  }

  d.priv = emptyPrivate();
  for (const player of humans) {
    player.score = 0;
    player.cracks = 0;
    player.ready = false;
  }
  for (const bot of shuffled(BOTS, a.rng).slice(0, botCount)) {
    pub.players[bot.id] = {
      id: bot.id,
      name: bot.name,
      avatar: bot.avatar,
      isBot: true,
      isHost: false,
      score: 0,
      cracks: 0,
      ready: true,
      joinedAt: a.now,
    };
    d.priv.botDecks[bot.id] = shuffled(bot.cards.map((_, i) => i), a.rng);
  }
  pub.settings.botCount = botCount;
  pub.round = 0;
  pub.result = null;
  beginRound(d, a.now, a.rng);
  return d;
}

/** How many more times this player may ask for lies this round. */
export function draftsLeft(s: RoomState, playerId: string): number {
  const player = requirePlayer(s, playerId);
  if (player.isBot) fail("forbidden", "Bots do not write cards.");
  if (s.pub.phase !== "writing") fail("wrong_phase", "Writing time is over.");
  if (player.ready) fail("wrong_phase", "Your card is already locked in.");
  const used = get(s.priv.drafts, playerId)?.count ?? 0;
  return Math.max(0, LIMITS.MAX_DRAFTS_PER_ROUND - used);
}

/** Stores the lies the caller got for this player (or the fact that it got none). */
export function setDraft(
  s: RoomState,
  a: {
    playerId: string;
    truths: Truths;
    candidates: string[];
    starters: string[];
    source: DraftSource;
    now: number;
  },
): RoomState {
  if (draftsLeft(s, a.playerId) <= 0) {
    fail("rate_limited", "You have used all your lie requests for this round.");
  }
  const truths = cleanTruths(a.truths);
  const tidy = (items: string[]) =>
    (items ?? []).map((item) => String(item).trim()).filter((item) => item.length > 0);
  const candidates =
    a.source === "ai" ? tidy(a.candidates).slice(0, s.pub.settings.lieOptions) : [];

  const d = clone(s);
  d.priv.drafts[a.playerId] = {
    truths,
    candidates,
    starters: tidy(a.starters),
    source: a.source,
    count: (get(d.priv.drafts, a.playerId)?.count ?? 0) + 1,
  };
  return d;
}

export function submitCard(
  s: RoomState,
  a: { playerId: string; truths: Truths; lie: LieChoice; now: number; rng: Rng },
): RoomState {
  const player = requirePlayer(s, a.playerId);
  if (player.isBot) fail("forbidden", "Bots do not write cards.");
  if (s.pub.phase !== "writing") fail("wrong_phase", "Writing time is over.");
  if (player.ready) fail("wrong_phase", "Your card is already locked in.");

  const truths = cleanTruths(a.truths);
  const draft = get(s.priv.drafts, a.playerId);
  const draftMatches =
    draft !== undefined &&
    draft.truths[0].trim() === truths[0] &&
    draft.truths[1].trim() === truths[1];

  let lie: string;
  let lieSource: LieSource;
  if (a.lie.kind === "ai") {
    const index = a.lie.index;
    if (!draft || !draftMatches) {
      fail("bad_request", "Ask for new lies: your truths changed since the last ones.");
    }
    if (!Number.isInteger(index) || index < 0 || index >= draft.candidates.length) {
      fail("bad_request", "That lie is not one of your options.");
    }
    lie = draft.candidates[index];
    lieSource = "ai";
  } else {
    // A host can turn own lies off, but a player with no AI lies to pick from
    // may always write one, so nobody is ever stuck.
    const hasAiLies = draft !== undefined && draft.candidates.length > 0;
    if (!s.pub.settings.allowOwnLie && hasAiLies) {
      fail("forbidden", "The host turned off writing your own lie. Pick an AI lie.");
    }
    const parsed = StatementSchema.safeParse(a.lie.text);
    if (!parsed.success) {
      fail(
        "bad_request",
        `Your lie needs ${LIMITS.STATEMENT_MIN} to ${LIMITS.STATEMENT_MAX} characters.`,
      );
    }
    lie = parsed.data;
    lieSource = "own";
  }
  if (sameText(lie, truths[0]) || sameText(lie, truths[1])) {
    fail("bad_request", "The lie must be different from both truths.");
  }

  const d = clone(s);
  const starter =
    draft && draftMatches && draft.starters.length > 0
      ? draft.starters[randInt(a.rng, 0, draft.starters.length - 1)]
      : fallbackStarter(player.name, truths, a.rng);
  d.priv.cards[a.playerId] = buildCard(truths, lie, lieSource, starter, a.rng);
  d.pub.players[a.playerId].ready = true;
  if (allHumansReady(d.pub)) endWriting(d, a.now, a.rng);
  return d;
}

export function submitGuess(
  s: RoomState,
  a: { playerId: string; seq: number; choice: Choice; now: number; rng: Rng },
): RoomState {
  const player = requirePlayer(s, a.playerId);
  if (a.seq !== s.pub.seq) fail("stale", "That card has already moved on.");
  if (s.pub.phase !== "guessing" || !s.pub.card) {
    fail("wrong_phase", "There is no card to guess on right now.");
  }
  if (player.isBot) fail("forbidden", "Bots guess on their own.");
  if (s.pub.card.authorId === a.playerId) {
    fail("forbidden", "You cannot guess on your own card.");
  }
  if (!guessersOf(s.pub).some((p) => p.id === a.playerId)) {
    fail("forbidden", "You joined after this card came up. You are in from the next one.");
  }
  if (get(s.priv.guesses, a.playerId)) fail("bad_request", "Your guess is already in.");
  const choice = ChoiceSchema.safeParse(a.choice);
  if (!choice.success) fail("bad_request", "Pick one of the three statements.");

  const d = clone(s);
  d.priv.guesses[a.playerId] = { choice: choice.data, at: a.now };
  if (d.pub.card && !d.pub.card.guessedIds.includes(a.playerId)) {
    d.pub.card.guessedIds.push(a.playerId);
  }
  if (allHumansGuessed(d)) revealCard(d, a.now, a.rng);
  return d;
}

/**
 * Moves the game on when the current phase's timer has run out. Any player's
 * browser may call it, any number of times: a tick that is early, late for a
 * phase that already ended, or sent while on hold returns the same room.
 */
export function tick(s: RoomState, a: { seq: number; now: number; rng: Rng }): RoomState {
  const { pub } = s;
  if (a.seq !== pub.seq || pub.phaseEndsAt === null || pub.held) return s;
  if (a.now + LIMITS.TICK_GRACE_MS < pub.phaseEndsAt) return s;
  const d = clone(s);
  return advance(d, a.now, a.rng) ? d : s;
}

export function hostAction(
  s: RoomState,
  a: { playerId: string; action: HostAction; now: number; rng: Rng },
): RoomState {
  requireHost(s, a.playerId);
  const parsed = HostActionSchema.safeParse(a.action);
  if (!parsed.success) fail("bad_request", "Unknown host action.");
  const action = parsed.data;
  const d = clone(s);
  const { pub } = d;

  switch (action.action) {
    case "skip": {
      if (!advance(d, a.now, a.rng)) fail("wrong_phase", "There is nothing to skip.");
      return d;
    }
    case "hold": {
      if (pub.phase !== "reveal") {
        fail("wrong_phase", "You can only hold during a reveal.");
      }
      if (pub.held) {
        pub.held = false;
        pub.phaseEndsAt = a.now + pub.settings.revealSeconds * 1000;
      } else {
        pub.held = true;
        pub.phaseEndsAt = null;
      }
      return d;
    }
    case "kick": {
      if (action.targetId === a.playerId) fail("bad_request", "You cannot remove yourself.");
      if (!get(pub.players, action.targetId)) {
        fail("not_found", "That player is not in the room.");
      }
      removePlayer(d, action.targetId, a.now, a.rng);
      return d;
    }
    case "playAgain": {
      if (pub.phase !== "gameOver") {
        fail("wrong_phase", "You can only play again after the game ends.");
      }
      for (const player of Object.values(pub.players)) {
        if (player.isBot) {
          delete pub.players[player.id];
          continue;
        }
        player.score = 0;
        player.cracks = 0;
        player.ready = false;
      }
      d.priv = emptyPrivate();
      pub.round = 0;
      pub.order = [];
      pub.cardIndex = 0;
      pub.card = null;
      pub.reveal = null;
      pub.roundSummary = null;
      pub.result = null;
      pub.held = false;
      pub.phase = "lobby";
      pub.phaseStartedAt = null;
      pub.phaseEndsAt = null;
      pub.seq += 1;
      return d;
    }
  }
}

/** What one player may know that the others may not. */
export function meView(s: RoomState, playerId: string): MeResponse {
  requirePlayer(s, playerId);
  const draft = get(s.priv.drafts, playerId);
  const card = get(s.priv.cards, playerId);
  const guess = get(s.priv.guesses, playerId);
  return {
    playerId,
    isHost: s.pub.hostId === playerId,
    draft: draft
      ? {
          truths: [draft.truths[0], draft.truths[1]],
          candidates: [...draft.candidates],
          source: draft.source,
          draftsLeft: Math.max(0, LIMITS.MAX_DRAFTS_PER_ROUND - draft.count),
        }
      : null,
    card: card ? { lieIndex: card.lieIndex, lieSource: card.lieSource } : null,
    myGuess: guess ? guess.choice : null,
  };
}
