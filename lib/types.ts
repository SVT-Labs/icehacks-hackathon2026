// The contract between the browser, the game engine and the API.
// Every TypeScript type is inferred from a Zod schema in this file.
//
// The public room is stored in Firebase Realtime Database, which drops null
// values, empty objects and empty arrays. Every field that can be empty
// therefore has a default, and the browser parses each snapshot through
// PublicRoomSchema before using it.

import { z } from "zod";
import { AVATARS, LIMITS, PHASES, SETTING_RANGES as R } from "./constants";

// ---------- Small pieces ----------

export const AvatarSchema = z.enum(AVATARS);
export type Avatar = z.infer<typeof AvatarSchema>;

export const PhaseSchema = z.enum(PHASES);
export type Phase = z.infer<typeof PhaseSchema>;

/** Position of a statement on a card: 0, 1 or 2. */
export const ChoiceSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export type Choice = z.infer<typeof ChoiceSchema>;

export const NameSchema = z.string().trim().min(1).max(LIMITS.NAME_MAX);

export const StatementSchema = z
  .string()
  .trim()
  .min(LIMITS.STATEMENT_MIN)
  .max(LIMITS.STATEMENT_MAX);

export const LieSourceSchema = z.enum(["ai", "own"]);
export type LieSource = z.infer<typeof LieSourceSchema>;

// ---------- Host settings ----------

const int = (range: { min: number; max: number }) =>
  z.number().int().min(range.min).max(range.max);

export const SettingsSchema = z.object({
  /** The game ends after a round in which someone has reached this score. */
  targetScore: int(R.targetScore),
  /** The game also ends after this many rounds. */
  maxRounds: int(R.maxRounds),
  writeSeconds: int(R.writeSeconds),
  guessSeconds: int(R.guessSeconds),
  revealSeconds: int(R.revealSeconds),
  /** Points for spotting the lie. */
  pointsCorrect: int(R.pointsCorrect),
  /** Adds up to half of pointsCorrect for a fast correct guess. */
  speedBonus: z.boolean(),
  /** Points lost for a wrong guess or no guess. */
  penaltyWrong: int(R.penaltyWrong),
  /** Points the author gets for each player who picked a truth. */
  pointsPerFooled: int(R.pointsPerFooled),
  /** Extra percentage on the author's points when the lie was AI-written. */
  aiLieBonusPct: int(R.aiLieBonusPct),
  /** Points the author loses when the lie was too easy to spot. */
  penaltyEasy: int(R.penaltyEasy),
  /** "Too easy" means at least this share of guessers spotted the lie. */
  easyThresholdPct: int(R.easyThresholdPct),
  /** How many AI lies a player can choose from. */
  lieOptions: int(R.lieOptions),
  allowOwnLie: z.boolean(),
  botCount: int(R.botCount),
  maxPlayers: int(R.maxPlayers),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  targetScore: 1000,
  maxRounds: 3,
  writeSeconds: 60,
  guessSeconds: 30,
  revealSeconds: 8,
  pointsCorrect: 100,
  speedBonus: true,
  penaltyWrong: 50,
  pointsPerFooled: 50,
  aiLieBonusPct: 50,
  penaltyEasy: 50,
  easyThresholdPct: 60,
  lieOptions: 3,
  allowOwnLie: true,
  botCount: 0,
  maxPlayers: 8,
};

export const SettingsPatchSchema = SettingsSchema.partial();
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

// ---------- Public room (what every browser sees) ----------

export const PlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: AvatarSchema,
  isBot: z.boolean().default(false),
  isHost: z.boolean().default(false),
  score: z.number().default(0),
  /** Point losses in the current round. Resets when a round starts. */
  cracks: z.number().default(0),
  /** Writing phase: this player's card is locked in. */
  ready: z.boolean().default(false),
  joinedAt: z.number().default(0),
});
export type Player = z.infer<typeof PlayerSchema>;

export const CardSchema = z.object({
  authorId: z.string(),
  statements: z.tuple([z.string(), z.string(), z.string()]),
  /** Players whose guess is in. Their choices stay secret until the reveal. */
  guessedIds: z.array(z.string()).default([]),
  /** When each bot will appear to lock in its guess (server time, ms). */
  botGuessAt: z.record(z.string(), z.number()).default({}),
});
export type Card = z.infer<typeof CardSchema>;

export const RevealSchema = z.object({
  lieIndex: ChoiceSchema,
  lieSource: LieSourceSchema,
  /** A player missing from picks did not answer in time. */
  picks: z.record(z.string(), ChoiceSchema).default({}),
  /** Point change per player for this card, before the floor at zero. */
  deltas: z.record(z.string(), z.number()).default({}),
  /** A conversation starter built from one of the truths. */
  starter: z.string().default(""),
});
export type Reveal = z.infer<typeof RevealSchema>;

export const RoundSummarySchema = z.object({
  /** Players whose ice broke this round. */
  splashedIds: z.array(z.string()).default([]),
  /** Net score change per player over the whole round. */
  deltas: z.record(z.string(), z.number()).default({}),
});
export type RoundSummary = z.infer<typeof RoundSummarySchema>;

export const LearnedSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  truth: z.string(),
});
export type Learned = z.infer<typeof LearnedSchema>;

export const ResultSchema = z.object({
  winnerIds: z.array(z.string()).default([]),
  /** Fooled the most players over the game. */
  bestLiarId: z.string().nullable().default(null),
  /** Spotted the most lies over the game. */
  sharpestEyeId: z.string().nullable().default(null),
  learned: z.array(LearnedSchema).default([]),
});
export type Result = z.infer<typeof ResultSchema>;

export const PublicRoomSchema = z.object({
  code: z.string(),
  hostId: z.string(),
  createdAt: z.number().default(0),
  /** Goes up by one on every phase change. Guesses and ticks must send it. */
  seq: z.number().default(0),
  settings: SettingsSchema,
  /** How many bot characters exist; the upper limit for settings.botCount. */
  maxBots: z.number().default(0),
  phase: PhaseSchema,
  phaseStartedAt: z.number().nullable().default(null),
  /** Server time in ms. Null when the phase has no timer or is on hold. */
  phaseEndsAt: z.number().nullable().default(null),
  /** Reveal only: the host paused the countdown. */
  held: z.boolean().default(false),
  round: z.number().default(0),
  players: z.record(z.string(), PlayerSchema).default({}),
  /** Authors of this round's cards, in the order they are shown. */
  order: z.array(z.string()).default([]),
  cardIndex: z.number().default(0),
  card: CardSchema.nullable().default(null),
  reveal: RevealSchema.nullable().default(null),
  roundSummary: RoundSummarySchema.nullable().default(null),
  result: ResultSchema.nullable().default(null),
});
export type PublicRoom = z.infer<typeof PublicRoomSchema>;

// ---------- API bodies and responses ----------

export const CreateRoomBodySchema = z.object({
  nickname: NameSchema,
  avatar: AvatarSchema,
});
export type CreateRoomBody = z.infer<typeof CreateRoomBodySchema>;

export const JoinBodySchema = CreateRoomBodySchema;
export type JoinBody = CreateRoomBody;

export type CreateRoomResponse = { code: string; playerId: string; token: string };
export type JoinResponse = { playerId: string; token: string };

export const TruthsSchema = z.tuple([StatementSchema, StatementSchema]);
export type Truths = z.infer<typeof TruthsSchema>;

export const DraftBodySchema = z.object({ truths: TruthsSchema });
export type DraftBody = z.infer<typeof DraftBodySchema>;

export const DraftSourceSchema = z.enum(["ai", "unavailable"]);
export type DraftSource = z.infer<typeof DraftSourceSchema>;

export type DraftResponse = {
  /** AI-written lies to choose from. Empty when source is "unavailable". */
  candidates: string[];
  source: DraftSource;
  /** How many more times this player may ask this round. */
  draftsLeft: number;
};

export const LieChoiceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ai"), index: z.number().int().min(0).max(4) }),
  z.object({ kind: z.literal("own"), text: StatementSchema }),
]);
export type LieChoice = z.infer<typeof LieChoiceSchema>;

export const CardBodySchema = z.object({
  truths: TruthsSchema,
  lie: LieChoiceSchema,
});
export type CardBody = z.infer<typeof CardBodySchema>;

export const GuessBodySchema = z.object({
  seq: z.number().int(),
  choice: ChoiceSchema,
});
export type GuessBody = z.infer<typeof GuessBodySchema>;

export const TickBodySchema = z.object({ seq: z.number().int() });
export type TickBody = z.infer<typeof TickBodySchema>;

export const HostActionSchema = z.discriminatedUnion("action", [
  /** End the current phase now. */
  z.object({ action: z.literal("skip") }),
  /** Reveal only: pause or resume the countdown. */
  z.object({ action: z.literal("hold") }),
  z.object({ action: z.literal("kick"), targetId: z.string() }),
  /** Game over only: back to the lobby with the same players. */
  z.object({ action: z.literal("playAgain") }),
]);
export type HostAction = z.infer<typeof HostActionSchema>;

/** What one player may know that the others may not. */
export type MeResponse = {
  playerId: string;
  isHost: boolean;
  draft: null | {
    truths: Truths;
    candidates: string[];
    source: DraftSource;
    draftsLeft: number;
  };
  /** This player's locked-in card for the current round. */
  card: null | { lieIndex: Choice; lieSource: LieSource };
  /** This player's guess on the card being shown. */
  myGuess: Choice | null;
};

export type OkResponse = { ok: true };

export const API_ERROR_CODES = [
  "bad_request",
  "not_found",
  "forbidden",
  "wrong_phase",
  "stale",
  "room_full",
  "name_taken",
  "unsafe",
  "rate_limited",
  "unavailable",
  "internal",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Every failed API call answers with this body and a 4xx or 5xx status. */
export type ApiError = { error: string; code: ApiErrorCode };

/** HTTP status for each error code. */
export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  forbidden: 403,
  not_found: 404,
  wrong_phase: 409,
  stale: 409,
  room_full: 409,
  name_taken: 409,
  unsafe: 422,
  rate_limited: 429,
  unavailable: 503,
  internal: 500,
};

/** Turns Zod issues into one short sentence for an error message. */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}
