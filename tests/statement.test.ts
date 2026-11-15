import { describe, expect, it } from "vitest";
import { NOT_A_SENTENCE, sentenceProblem, tooAlike } from "@/lib/statement";

describe("sentenceProblem", () => {
  it.each([
    "aaaaaaaa",
    "aaaaaaaaa",
    "aaaaaaaaaa",
    "abababab",
    "asdfghjkl",
    "asd asd asd asd",
    "abcd abcd abcd",
    "12345678",
    "!!!!!!!!!!",
    "😀😀😀😀😀😀😀😀",
    "bcdfg hjklm",
    "I looooooove pizza",
    "qqqq wwww",
  ])("refuses key-mashing: %s", (text) => {
    expect(sentenceProblem(text)).toBe(NOT_A_SENTENCE);
  });

  it.each([
    "I have never been on a plane.",
    "I am 12 years old.",
    "I am 12.",
    "I loooove pizza",
    "My cat is called Tom.",
    "I once ate 40 dumplings!!!",
    "Hayatımda hiç uçağa binmedim.",
    "Köpeğim var, adı Pamuk.",
    "Nunca he visto la nieve.",
    "Я никогда не летал на самолёте.",
    "我从来没有坐过飞机。",
    "私は一度も飛行機に乗ったことがない。",
    "나는 비행기를 타본 적이 없어요.",
    "I can type <script>alert(1)</script> blindfolded.",
  ])("accepts a real statement: %s", (text) => {
    expect(sentenceProblem(text)).toBeNull();
  });
});

describe("tooAlike", () => {
  it("treats case, spacing and punctuation as no difference", () => {
    expect(tooAlike("I like cats", "i like cats.")).toBe(true);
    expect(tooAlike("I like cats", "I  like, CATS!")).toBe(true);
  });

  it("treats a statement with a little added as the same", () => {
    expect(tooAlike("I have a pet turtle", "I have a pet turtle x")).toBe(true);
  });

  it("allows a statement that changes one detail", () => {
    expect(tooAlike("I have two brothers", "I have three brothers")).toBe(false);
    expect(tooAlike("I have never been on a plane", "I have never been on a boat")).toBe(false);
  });

  it("allows a statement that adds a real clause", () => {
    expect(tooAlike("I have a dog", "I have a dog that can open doors")).toBe(false);
  });
});
