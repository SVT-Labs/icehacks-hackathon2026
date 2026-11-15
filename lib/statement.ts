// These checks are deliberately mild, so short, casual and non-English
// statements pass. They cannot stop real-looking nonsense words.

export const NOT_A_SENTENCE =
  "That does not read like a real sentence. Write it out in a few plain words.";

export const TOO_ALIKE =
  "Two of your statements are almost the same. Make each one clearly different.";

// Scripts written without spaces between words.
const SPACELESS =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

const LATIN_VOWEL = /[aeiouyàáâãäåæèéêëìíîïòóôõöøùúûüýÿāēīōūăĕĭŏŭıœ]/i;

export function sentenceProblem(text: string): string | null {
  const clean = text.normalize("NFC").replace(/\s+/g, " ").trim();
  const letters = clean.match(/\p{L}/gu) ?? [];
  const visible = clean.replace(/\s/g, "");

  // Mostly digits, symbols or emoji.
  if (letters.length * 2 < [...visible].length) return NOT_A_SENTENCE;

  // "aaaaaaaa", "abababab": too few different characters to be words.
  const distinct = new Set((clean.toLowerCase().match(/[\p{L}\p{N}]/gu) ?? []));
  if (distinct.size < 4) return NOT_A_SENTENCE;

  // The same character five or more times in a row ("loooove" is allowed).
  if (/(.)\1{4,}/u.test(clean)) return NOT_A_SENTENCE;

  const words = clean
    .toLowerCase()
    .split(" ")
    .filter((word) => /\p{L}/u.test(word));

  if (!SPACELESS.test(clean)) {
    // One long "word", or the same word over and over.
    if (words.length < 2) return NOT_A_SENTENCE;
    if (new Set(words).size < 2) return NOT_A_SENTENCE;
  }

  // Latin-script text with no vowel anywhere ("bcdfg hjklm").
  const latin = letters.filter((ch) => /\p{Script=Latin}/u.test(ch));
  if (latin.length * 5 >= letters.length * 4 && !latin.some((ch) => LATIN_VOWEL.test(ch))) {
    return NOT_A_SENTENCE;
  }

  return null;
}

const bare = (text: string) =>
  (text.normalize("NFC").toLowerCase().match(/[\p{L}\p{N}]/gu) ?? []).join("");

export function tooAlike(a: string, b: string): boolean {
  const x = bare(a);
  const y = bare(b);
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length > 0 && long.includes(short) && short.length * 100 >= long.length * 85;
}
