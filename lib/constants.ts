export const AVATARS = [
  "navy",
  "teal",
  "coral",
  "sun",
  "plum",
  "mint",
  "rose",
  "slate",
] as const;

export const PHASES = [
  "lobby",
  "writing",
  "guessing",
  "reveal",
  "roundEnd",
  "gameOver",
] as const;

// No I, L, O, 0 or 1: they are easy to misread when a code is said aloud.
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const LIMITS = {
  NAME_MAX: 16,
  STATEMENT_MIN: 8,
  STATEMENT_MAX: 120,
  ROOM_CODE_LENGTH: 5,
  MAX_DRAFTS_PER_ROUND: 3,
  ROUND_END_SECONDS: 12,
  CRACKS_TO_SPLASH: 3,
  TICK_GRACE_MS: 300,
  SOLO_BOT_MIN: 2,
  LEARNED_MAX: 40,
} as const;

export const SETTING_RANGES = {
  targetScore: { min: 300, max: 5000, step: 100 },
  maxRounds: { min: 1, max: 5, step: 1 },
  writeSeconds: { min: 30, max: 180, step: 15 },
  guessSeconds: { min: 10, max: 90, step: 5 },
  revealSeconds: { min: 5, max: 20, step: 1 },
  pointsCorrect: { min: 0, max: 500, step: 10 },
  penaltyWrong: { min: 0, max: 300, step: 10 },
  pointsPerFooled: { min: 0, max: 300, step: 10 },
  aiLieBonusPct: { min: 0, max: 200, step: 10 },
  penaltyEasy: { min: 0, max: 300, step: 10 },
  easyThresholdPct: { min: 50, max: 100, step: 5 },
  lieOptions: { min: 3, max: 5, step: 1 },
  botCount: { min: 0, max: 8, step: 1 },
  maxPlayers: { min: 2, max: 12, step: 1 },
} as const;
