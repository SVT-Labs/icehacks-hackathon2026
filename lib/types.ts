// Every type is inferred from a Zod schema in this file. Firebase Realtime
// Database drops null values, empty objects and empty arrays, so every field
// that can be empty has a default.

import { z } from "zod";
import { AVATARS, LIMITS, PHASES, SETTING_RANGES as R } from "./constants";

export const AvatarSchema = z.enum(AVATARS);
export type Avatar = z.infer<typeof AvatarSchema>;

export const PhaseSchema = z.enum(PHASES);
export type Phase = z.infer<typeof PhaseSchema>;

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

const int = (range: { min: number; max: number }) =>
  z.number().int().min(range.min).max(range.max);

export const SettingsSchema = z.object({
  targetScore: int(R.targetScore),
  maxRounds: int(R.maxRounds),
  writeSeconds: int(R.writeSeconds),
  guessSeconds: int(R.guessSeconds),
  revealSeconds: int(R.revealSeconds),
  pointsCorrect: int(R.pointsCorrect),
  speedBonus: z.boolean(),
  penaltyWrong: int(R.penaltyWrong),
  pointsPerFooled: int(R.pointsPerFooled),
  aiLieBonusPct: int(R.aiLieBonusPct),
  penaltyEasy: int(R.penaltyEasy),
  easyThresholdPct: int(R.easyThresholdPct),
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

export const PlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: AvatarSchema,
  isBot: z.boolean().default(false),
  isHost: z.boolean().default(false),
  score: z.number().default(0),
  cracks: z.number().default(0),
  ready: z.boolean().default(false),
  joinedAt: z.number().default(0),
});
export type Player = z.infer<typeof PlayerSchema>;

export const CardSchema = z.object({
  authorId: z.string(),
  statements: z.tuple([z.string(), z.string(), z.string()]),
  guessedIds: z.array(z.string()).default([]),
  botGuessAt: z.record(z.string(), z.number()).default({}),
});
export const RevealSchema = z.object({
  lieIndex: ChoiceSchema,
  lieSource: LieSourceSchema,
  picks: z.record(z.string(), ChoiceSchema).default({}),
  deltas: z.record(z.string(), z.number()).default({}),
  starter: z.string().default(""),
});
export type Reveal = z.infer<typeof RevealSchema>;

export const RoundSummarySchema = z.object({
  splashedIds: z.array(z.string()).default([]),
  deltas: z.record(z.string(), z.number()).default({}),
});
export const LearnedSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  truth: z.string(),
});
export type Learned = z.infer<typeof LearnedSchema>;

export const ResultSchema = z.object({
  winnerIds: z.array(z.string()).default([]),
  bestLiarId: z.string().nullable().default(null),
  sharpestEyeId: z.string().nullable().default(null),
  learned: z.array(LearnedSchema).default([]),
});
export type Result = z.infer<typeof ResultSchema>;

export const PublicRoomSchema = z.object({
  code: z.string(),
  hostId: z.string(),
  createdAt: z.number().default(0),
  seq: z.number().default(0),
  settings: SettingsSchema,
  maxBots: z.number().default(0),
  phase: PhaseSchema,
  phaseStartedAt: z.number().nullable().default(null),
  phaseEndsAt: z.number().nullable().default(null),
  held: z.boolean().default(false),
  round: z.number().default(0),
  players: z.record(z.string(), PlayerSchema).default({}),
  order: z.array(z.string()).default([]),
  cardIndex: z.number().default(0),
  card: CardSchema.nullable().default(null),
  reveal: RevealSchema.nullable().default(null),
  roundSummary: RoundSummarySchema.nullable().default(null),
  result: ResultSchema.nullable().default(null),
});
export type PublicRoom = z.infer<typeof PublicRoomSchema>;

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
export const DraftSourceSchema = z.enum(["ai", "unavailable"]);
export type DraftSource = z.infer<typeof DraftSourceSchema>;

export type DraftResponse = {
  candidates: string[];
  source: DraftSource;
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
export const HostActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("skip") }),
  z.object({ action: z.literal("hold") }),
  z.object({ action: z.literal("kick"), targetId: z.string() }),
  z.object({ action: z.literal("playAgain") }),
]);
export type HostAction = z.infer<typeof HostActionSchema>;

export type MeResponse = {
  playerId: string;
  isHost: boolean;
  draft: null | {
    truths: Truths;
    candidates: string[];
    source: DraftSource;
    draftsLeft: number;
  };
  card: null | { lieIndex: Choice; lieSource: LieSource };
  myGuess: Choice | null;
};

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

export function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}
