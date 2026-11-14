import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkOutput, draftLies, type LlmDeps } from "@/lib/server/llm";
import { resetMemoryStore } from "@/lib/server/store";

const TRUTHS: [string, string] = ["I have climbed a volcano in Iceland.", "I keep a jar of buttons from my gran."];
const LIES = ["I once slept in a lighthouse.", "I can play the bagpipes badly.", "I have met a real astronaut.", "I ate snails in Paris once."];
const STARTERS = ["Ask {name} about the volcano.", "Ask {name} about the buttons."];
const GOOD = { verdict: "ok" as const, lies: LIES.slice(0, 3), starters: STARTERS };

type Parse = NonNullable<LlmDeps["parse"]>;
const env = { ANTHROPIC_API_KEY: "test-key", LLM_DAILY_CAP: "1500" };

function parseReturning(...outputs: Array<{ stop_reason?: string; parsed_output: unknown } | Error>) {
  const fn = vi.fn<Parse>();
  for (const out of outputs) {
    if (out instanceof Error) fn.mockRejectedValueOnce(out);
    else fn.mockResolvedValueOnce({ stop_reason: out.stop_reason ?? "end_turn", parsed_output: out.parsed_output as never });
  }
  return fn;
}

beforeEach(() => {
  delete process.env.FIREBASE_DATABASE_URL;
  resetMemoryStore();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("checkOutput", () => {
  it("accepts good output and drops extra lies", () => {
    const result = checkOutput({ verdict: "ok", lies: LIES, starters: STARTERS }, TRUTHS, 3);
    expect(result).toEqual({ ok: true, lies: LIES.slice(0, 3), starters: STARTERS });
  });

  it("drops lies that repeat a truth, repeat each other or break the length limits", () => {
    const lies = [TRUTHS[0].toUpperCase(), LIES[0], LIES[0].toLowerCase(), "short", "x".repeat(121), LIES[1], LIES[2]];
    const result = checkOutput({ verdict: "ok", lies, starters: STARTERS }, TRUTHS, 3);
    expect(result).toEqual({ ok: true, lies: LIES.slice(0, 3), starters: STARTERS });
  });

  it("fails with fewer than three usable lies or the wrong starters", () => {
    const few = checkOutput({ verdict: "ok", lies: LIES.slice(0, 2), starters: STARTERS }, TRUTHS, 3);
    expect(few.ok).toBe(false);
    const starters = checkOutput({ verdict: "ok", lies: LIES, starters: ["only one"] }, TRUTHS, 3);
    expect(starters.ok).toBe(false);
    if (!starters.ok) expect(starters.problems.join(" ")).toContain("two starters");
  });
});

describe("draftLies", () => {
  it("returns validated lies from one call", async () => {
    const parse = parseReturning({ parsed_output: GOOD });
    const result = await draftLies(TRUTHS, 3, { parse, env });
    expect(result).toEqual({ verdict: "ok", lies: GOOD.lies, starters: STARTERS });
    expect(parse).toHaveBeenCalledTimes(1);
    const [params, options] = parse.mock.calls[0];
    expect(params.model).toBe("claude-sonnet-5-5");
    expect(params.output_config.effort).toBe("low");
    expect(options.maxRetries).toBe(0);
    expect(options.timeout).toBeLessThanOrEqual(12_000);
    // Truths sit inside delimiters; no nickname is ever sent.
    const content = params.messages[0].content as string;
    expect(content).toContain(`<truths>\n1. ${TRUTHS[0]}\n2. ${TRUTHS[1]}\n</truths>`);
  });

  it("retries once with the problems listed, then succeeds", async () => {
    const parse = parseReturning({ parsed_output: { ...GOOD, lies: ["short"] } }, { parsed_output: GOOD });
    const result = await draftLies(TRUTHS, 3, { parse, env });
    expect(result.verdict).toBe("ok");
    expect(parse).toHaveBeenCalledTimes(2);
    const retry = parse.mock.calls[1][0].messages[0].content as string;
    expect(retry).toContain("previous answer had these problems");
    expect(retry).toContain("Only 0 usable lies");
  });

  it("gives up as unavailable after invalid output twice", async () => {
    const parse = parseReturning({ parsed_output: null }, { parsed_output: { ...GOOD, starters: [] } });
    expect(await draftLies(TRUTHS, 3, { parse, env })).toMatchObject({ verdict: "unavailable" });
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("maps an unsafe verdict and a refusal to unsafe", async () => {
    expect(await draftLies(TRUTHS, 3, { parse: parseReturning({ parsed_output: { verdict: "unsafe", lies: [], starters: [] } }), env })).toEqual({ verdict: "unsafe" });
    expect(await draftLies(TRUTHS, 3, { parse: parseReturning({ stop_reason: "refusal", parsed_output: null }), env })).toEqual({ verdict: "unsafe" });
  });

  it("reports unavailable when the call throws, without retrying", async () => {
    const parse = parseReturning(new Error("timeout"));
    expect(await draftLies(TRUTHS, 3, { parse, env })).toMatchObject({ verdict: "unavailable" });
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("stops at the daily cap", async () => {
    const parse = vi.fn<Parse>().mockResolvedValue({ stop_reason: "end_turn", parsed_output: GOOD });
    const capped = { ...env, LLM_DAILY_CAP: "2" };
    expect((await draftLies(TRUTHS, 3, { parse, env: capped })).verdict).toBe("ok");
    expect((await draftLies(TRUTHS, 3, { parse, env: capped })).verdict).toBe("ok");
    expect(await draftLies(TRUTHS, 3, { parse, env: capped })).toEqual({ verdict: "unavailable", reason: "daily_cap" });
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("counts the retry toward the daily cap", async () => {
    const parse = parseReturning({ parsed_output: null }, { parsed_output: GOOD });
    const result = await draftLies(TRUTHS, 3, { parse, env: { ...env, LLM_DAILY_CAP: "1" } });
    expect(result).toEqual({ verdict: "unavailable", reason: "daily_cap" });
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("gives up when the time budget runs out", async () => {
    let clock = 0;
    const parse = vi.fn<Parse>().mockImplementation(async () => {
      clock += 11_500;
      return { stop_reason: "end_turn", parsed_output: null };
    });
    const result = await draftLies(TRUTHS, 3, { parse, env, now: () => clock });
    expect(result).toEqual({ verdict: "unavailable", reason: "timeout" });
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("never calls the AI without a key or in demo mode", async () => {
    expect(await draftLies(TRUTHS, 3, { env: {} })).toEqual({ verdict: "unavailable", reason: "no_key" });
    const demo = await draftLies(TRUTHS, 5, { env: { DEMO_MODE: "true", ANTHROPIC_API_KEY: "x" } });
    expect(demo.verdict).toBe("ok");
    if (demo.verdict === "ok") expect(demo.lies).toHaveLength(5);
  });
});
