// Checks for text the AI never sees: nicknames and lies players write
// themselves. Truths go through here too, before the AI call, so obviously bad
// input costs nothing.

import { LIMITS } from "@/lib/constants";
import { GameError } from "@/lib/game";
import { BLOCKLIST } from "./blocklist";

export const UNSAFE_MESSAGE =
  "Please rewrite that one. Keep it friendly and leave out private details.";

/** Trims, strips control characters and collapses runs of whitespace. */
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
// shortcut: seven or more digits with at most single separators counts as a
// phone number, so "1999 2005" is rejected too; upgrade if players hit it.
const PHONE_LIKE = /(?:\+\s?)?(?:\d[\s().-]?){7,}/;

/** True when the text would be rejected as unsafe. */
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
  return check(text, LIMITS.STATEMENT_MIN, LIMITS.STATEMENT_MAX, "Each statement");
}

export function moderateTruths(truths: readonly [string, string]): [string, string] {
  return [moderateStatement(truths[0]), moderateStatement(truths[1])];
}
