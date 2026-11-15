import { LIMITS } from "@/lib/constants";
import { GameError } from "@/lib/game";
import { TOO_ALIKE, sentenceProblem, tooAlike } from "@/lib/statement";
import { BLOCKLIST } from "./blocklist";

export const UNSAFE_MESSAGE =
  "Please rewrite that one. Keep it friendly and leave out private details.";

export function tidy(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "@": "a", $: "s" };

const BLOCKED = new RegExp(
  `(?:^|[^\\p{L}])(?:${BLOCKLIST.map((entry) =>
    entry.endsWith("*")
      ? `${escape(entry.slice(0, -1))}\\p{L}*`
      : escape(entry),
  ).join("|")})(?![\\p{L}])`,
  "iu",
);

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const URL_LIKE = /(?:https?:\/\/|www\.)\S|\b[a-z0-9-]+\.(?:com|net|org|io|ly|gg|me|co|tv|xyz|app|dev)\b/i;
const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
// Seven or more digits with at most single separators count as a phone number,
// so "1999 2005" is rejected too.
const PHONE_LIKE = /(?:\+\s?)?(?:\d[\s().-]?){7,}/;

export function isUnsafe(text: string): boolean {
  const lowered = text.toLowerCase();
  const unleet = lowered.replace(/[0134@$5]/g, (c) => LEET[c] ?? c);
  return (
    BLOCKED.test(lowered) ||
    BLOCKED.test(unleet) ||
    URL_LIKE.test(text) ||
    EMAIL_LIKE.test(text) ||
    PHONE_LIKE.test(text)
  );
}

function check(text: string, min: number, max: number, what: string): string {
  const clean = tidy(text);
  if (clean.length < min || clean.length > max) {
    throw new GameError(
      "bad_request",
      min === 1
        ? `${what} needs 1 to ${max} characters.`
        : `${what} needs ${min} to ${max} characters.`,
    );
  }
  if (isUnsafe(clean)) throw new GameError("unsafe", UNSAFE_MESSAGE);
  return clean;
}

export function moderateName(name: string): string {
  return check(name, 1, LIMITS.NAME_MAX, "Your nickname");
}

export function moderateStatement(text: string): string {
  const clean = check(text, LIMITS.STATEMENT_MIN, LIMITS.STATEMENT_MAX, "Each statement");
  const problem = sentenceProblem(clean);
  if (problem) throw new GameError("bad_request", problem);
  return clean;
}

export function moderateTruths(truths: readonly [string, string]): [string, string] {
  const clean: [string, string] = [moderateStatement(truths[0]), moderateStatement(truths[1])];
  if (tooAlike(clean[0], clean[1])) throw new GameError("bad_request", TOO_ALIKE);
  return clean;
}

export function moderateOwnLie(text: string, truths: readonly [string, string]): string {
  const clean = moderateStatement(text);
  if (truths.some((truth) => tooAlike(truth, clean))) throw new GameError("bad_request", TOO_ALIKE);
  return clean;
}
