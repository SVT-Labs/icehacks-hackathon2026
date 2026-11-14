// The server-only half of a room: everything a browser must not see before a
// reveal. The backend stores it next to the public room but never lets a
// browser read it; the mock driver keeps it in the tab's memory.
//
// Like the public room, it is stored in a database that drops null values,
// empty objects and empty arrays, so every field has a default.

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
  /** AI-written lies the player can choose from. */
  candidates: z.array(z.string()).default([]),
  /** Conversation starters, each built from one of the truths. */
  starters: z.array(z.string()).default([]),
  source: DraftSourceSchema,
  /** How many times this player has asked for lies this round. */
  count: z.number().default(0),
});
export type PrivateDraft = z.infer<typeof PrivateDraftSchema>;

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
  /** Server time in ms when the guess was (or will be) locked in. */
  at: z.number(),
});
export type PrivateGuess = z.infer<typeof PrivateGuessSchema>;

export const PrivateStatsSchema = z.object({
  /** Players this author has fooled over the game. */
  fooled: z.number().default(0),
  /** Lies this player has spotted over the game. */
  correct: z.number().default(0),
});
export type PrivateStats = z.infer<typeof PrivateStatsSchema>;

export const PrivateRoomSchema = z.object({
  /** This round's drafts, by player. */
  drafts: z.record(z.string(), PrivateDraftSchema).default({}),
  /** This round's locked cards, by author. */
  cards: z.record(z.string(), PrivateCardSchema).default({}),
  /** Human guesses on the card being shown. */
  guesses: z.record(z.string(), PrivateGuessSchema).default({}),
  /** What each bot will guess on the card being shown, and when. */
  botPlan: z.record(z.string(), PrivateGuessSchema).default({}),
  /** Card indexes each bot has not used yet. */
  botDecks: z.record(z.string(), z.array(z.number()).default([])).default({}),
  /** Each player's score when the round began. */
  roundStart: z.record(z.string(), z.number()).default({}),
  stats: z.record(z.string(), PrivateStatsSchema).default({}),
  /** Truths revealed so far, for the end-of-game recap. */
  learned: z
    .array(z.object({ playerId: z.string(), name: z.string(), truth: z.string() }))
    .default([]),
});
export type PrivateRoom = z.infer<typeof PrivateRoomSchema>;

export function emptyPrivate(): PrivateRoom {
  return PrivateRoomSchema.parse({});
}

/** A whole room: the half every browser sees and the half only the server sees. */
export type RoomState = { pub: PublicRoom; priv: PrivateRoom };
