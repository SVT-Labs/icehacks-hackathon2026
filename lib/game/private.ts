// The server-only half of a room: everything a browser must not see before a
// reveal.

import { z } from "zod";
import {
  ChoiceSchema,
  DraftSourceSchema,
  LieSourceSchema,
  type PublicRoom,
} from "../types";

const TruthPairSchema = z.tuple([z.string(), z.string()]);

export const PrivateDraftSchema = z.object({
  truths: TruthPairSchema,
  candidates: z.array(z.string()).default([]),
  starters: z.array(z.string()).default([]),
  source: DraftSourceSchema,
  count: z.number().default(0),
});
export const PrivateCardSchema = z.object({
  truths: TruthPairSchema,
  statements: z.tuple([z.string(), z.string(), z.string()]),
  lieIndex: ChoiceSchema,
  lieSource: LieSourceSchema,
  starter: z.string().default(""),
});
export type PrivateCard = z.infer<typeof PrivateCardSchema>;

export const PrivateGuessSchema = z.object({
  choice: ChoiceSchema,
  at: z.number(),
});
export const PrivateStatsSchema = z.object({
  fooled: z.number().default(0),
  correct: z.number().default(0),
});
export type PrivateStats = z.infer<typeof PrivateStatsSchema>;

export const PrivateRoomSchema = z.object({
  drafts: z.record(z.string(), PrivateDraftSchema).default({}),
  cards: z.record(z.string(), PrivateCardSchema).default({}),
  guesses: z.record(z.string(), PrivateGuessSchema).default({}),
  botPlan: z.record(z.string(), PrivateGuessSchema).default({}),
  botDecks: z.record(z.string(), z.array(z.number()).default([])).default({}),
  roundStart: z.record(z.string(), z.number()).default({}),
  stats: z.record(z.string(), PrivateStatsSchema).default({}),
  learned: z
    .array(z.object({ playerId: z.string(), name: z.string(), truth: z.string() }))
    .default([]),
});
export type PrivateRoom = z.infer<typeof PrivateRoomSchema>;

export function emptyPrivate(): PrivateRoom {
  return PrivateRoomSchema.parse({});
}

export type RoomState = { pub: PublicRoom; priv: PrivateRoom };
