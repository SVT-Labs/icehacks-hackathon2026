"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Button, Notice, Panel, Tag, cx } from "@/components/ui";
import { sfx } from "@/lib/client/sfx";
import { useDictation } from "@/lib/client/useDictation";
import { LIMITS } from "@/lib/constants";
import { sentenceProblem, tooAlike } from "@/lib/statement";
import type { DraftSource, LieChoice, Truths } from "@/lib/types";
import { Countdown } from "./Countdown";
import { humans, useAction, type GameCtx } from "./shared";

const OPENERS = [
  "I have never ",
  "I once ",
  "I can ",
  "I am afraid of ",
  "As a kid I ",
  "I still own ",
];

const MAX = LIMITS.STATEMENT_MAX;
const MIN = LIMITS.STATEMENT_MIN;

function problemWith(text: string, what: string): string | null {
  const length = text.trim().length;
  if (length === 0) return `Write ${what} first.`;
  if (length < MIN) return `Make ${what} a little longer (at least ${MIN} characters).`;
  // Key-mashing such as "aaaaaaaa" is refused here and again on the server.
  if (sentenceProblem(text.trim())) return `Rewrite ${what} as a real sentence, in a few plain words.`;
  return null;
}

export function Writing({ ctx }: { ctx: GameCtx }) {
  const { api, code, token, room, me, meId, refreshMe, now } = ctx;
  const player = room.players[meId];
  const action = useAction();

  const [truths, setTruths] = useState<[string, string]>(["", ""]);
  const [candidates, setCandidates] = useState<string[] | null>(null);
  const [source, setSource] = useState<DraftSource | null>(null);
  const [draftsLeft, setDraftsLeft] = useState<number>(LIMITS.MAX_DRAFTS_PER_ROUND);
  const [pick, setPick] = useState<number | "own" | null>(null);
  const [ownLie, setOwnLie] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const lastFocused = useRef<0 | 1>(0);

  // After a refresh, bring back what the server remembers of this player's
  // draft. This runs once, the first time the private state arrives.
  if (!restored && me) {
    setRestored(true);
    if (me.draft && candidates === null && !truths[0] && !truths[1]) {
      setTruths([me.draft.truths[0], me.draft.truths[1]]);
      setCandidates(me.draft.candidates);
      setSource(me.draft.source);
      setDraftsLeft(me.draft.draftsLeft);
      if (me.draft.candidates.length === 0) setPick("own");
    }
  }

  const stage: "truths" | "lie" = candidates !== null || pick === "own" ? "lie" : "truths";
  const aiReady = source === "ai" && (candidates?.length ?? 0) > 0;
  const mayWriteOwn = room.settings.allowOwnLie || !aiReady;

  function setTruth(index: 0 | 1, value: string) {
    setTruths((current) => {
      const next: [string, string] = [...current];
      next[index] = value.slice(0, MAX);
      return next;
    });
    if (fieldError) setFieldError(null);
  }

  function checkTruths(): Truths | null {
    const problem =
      problemWith(truths[0], "your first truth") ?? problemWith(truths[1], "your second truth");
    if (problem) {
      setFieldError(problem);
      return null;
    }
    const clean: Truths = [truths[0].trim(), truths[1].trim()];
    if (tooAlike(clean[0], clean[1])) {
      setFieldError("Your two truths are almost the same. Change one of them.");
      return null;
    }
    return clean;
  }

  async function forge() {
    const clean = checkTruths();
    if (!clean) return;
    await action.run("forge", async () => {
      const draft = await api.draft(code, token, clean);
      setCandidates(draft.candidates);
      setSource(draft.source);
      setDraftsLeft(draft.draftsLeft);
      setPick(draft.candidates.length > 0 ? 0 : "own");
      if (draft.candidates.length > 0) sfx.pop();
    });
  }

  function writeOwn() {
    if (!checkTruths()) return;
    setPick("own");
  }

  function editTruths() {
    setCandidates(null);
    setSource(null);
    setPick(null);
    action.setError(null);
  }

  async function lockIn() {
    const clean = checkTruths();
    if (!clean || pick === null) return;
    let lie: LieChoice;
    if (pick === "own") {
      const problem = problemWith(ownLie, "your lie");
      if (problem) return setFieldError(problem);
      const text = ownLie.trim();
      if (clean.some((t) => tooAlike(t, text))) {
        return setFieldError("Your lie is almost the same as one of your truths. Make it clearly different.");
      }
      lie = { kind: "own", text };
    } else {
      lie = { kind: "ai", index: pick };
    }
    const ok = await action.run("lock", () => api.submitCard(code, token, { truths: clean, lie }));
    if (ok) {
      sfx.lock();
      refreshMe();
    }
  }

  const people = humans(room);
  const readyCount = people.filter((p) => p.ready).length;
  const waitingFor = people.filter((p) => !p.ready && p.id !== meId).map((p) => p.name);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display font-semibold text-ink-soft">
            Round {room.round} of {room.settings.maxRounds}
          </p>
          <h1 className="text-4xl font-bold">
            {player?.ready ? "Your card is locked in" : "Write your card"}
          </h1>
        </div>
        <Countdown
          startedAt={room.phaseStartedAt}
          endsAt={room.phaseEndsAt}
          now={now}
          label="Time to write"
        />
      </div>

      {player?.ready ? (
        <Panel className="mt-6 space-y-3">
          <p className="flex items-center gap-2 text-lg font-semibold">
            <Icon name="check" className="text-good" /> Nobody can see it until its turn.
          </p>
          <p className="text-ink-soft" aria-live="polite">
            {readyCount} of {people.length} players are ready.
            {waitingFor.length > 0 ? ` Still writing: ${waitingFor.join(", ")}.` : ""}
          </p>
        </Panel>
      ) : (
        <div className="mt-6 space-y-5">
          <Panel className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold">Two true things about you</h2>
              {stage === "lie" ? (
                <Button variant="quiet" size="sm" icon="pencil" onClick={editTruths}>
                  Edit
                </Button>
              ) : null}
            </div>
            <TruthField
              index={0}
              value={truths[0]}
              locked={stage === "lie"}
              onChange={(value) => setTruth(0, value)}
              onFocus={() => (lastFocused.current = 0)}
            />
            <TruthField
              index={1}
              value={truths[1]}
              locked={stage === "lie"}
              onChange={(value) => setTruth(1, value)}
              onFocus={() => (lastFocused.current = 1)}
            />

            {stage === "truths" ? (
              <>
                <div>
                  <p className="mb-1.5 text-sm font-semibold text-ink-soft">Stuck? Start with:</p>
                  <div className="flex flex-wrap gap-2">
                    {OPENERS.map((opener) => (
                      <button
                        key={opener}
                        type="button"
                        className="min-h-9 rounded-control border-2 border-line bg-surface-2 px-3 text-sm font-semibold"
                        onClick={() => {
                          const target: 0 | 1 = truths[0].trim()
                            ? truths[1].trim()
                              ? lastFocused.current
                              : 1
                            : 0;
                          setTruth(target, opener);
                          document.getElementById(`truth-${target}`)?.focus();
                        }}
                      >
                        {opener.trim()}…
                      </button>
                    ))}
                  </div>
                </div>
                {fieldError ? <Notice>{fieldError}</Notice> : null}
                {action.error ? <Notice>{action.error}</Notice> : null}
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="accent"
                    icon="sparkle"
                    busy={action.busy === "forge"}
                    onClick={forge}
                  >
                    {action.busy === "forge" ? "Forging lies" : "Forge my lie"}
                  </Button>
                  {room.settings.allowOwnLie ? (
                    <Button variant="quiet" icon="pencil" onClick={writeOwn}>
                      Write my own lie
                    </Button>
                  ) : null}
                </div>
                <p className="text-sm text-ink-soft">
                  Everyone in this room will read what you write. Only share what you
                  are happy for them to know.
                </p>
              </>
            ) : null}
          </Panel>

          {stage === "lie" ? (
            <Panel className="space-y-4">
              <h2 className="text-2xl font-semibold">Now pick your lie</h2>

              {source === "unavailable" ? (
                <Notice tone="info">
                  The AI is not answering right now, so write the lie yourself. The game
                  goes on as normal.
                </Notice>
              ) : null}

              <fieldset className="space-y-2.5">
                <legend className="sr-only">Choose the lie for your card</legend>
                {(candidates ?? []).map((text, index) => (
                  <label
                    key={`${index}-${text}`}
                    className={cx(
                      "flex cursor-pointer items-start gap-3 rounded-control border-2 p-3.5",
                      "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--focus)",
                      pick === index ? "border-ai bg-ai-bg" : "border-line bg-surface",
                    )}
                  >
                    <input
                      type="radio"
                      name="lie"
                      className="mt-1 size-5 accent-(--ai)"
                      checked={pick === index}
                      onChange={() => {
                        setPick(index);
                        setFieldError(null);
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block text-lg">{text}</span>
                      <span className="mt-1 block">
                        <Tag tone="ai" icon="sparkle">
                          AI lie
                          {room.settings.aiLieBonusPct > 0
                            ? ` · +${room.settings.aiLieBonusPct}% when it fools someone`
                            : ""}
                        </Tag>
                      </span>
                    </span>
                  </label>
                ))}

                {mayWriteOwn ? (
                  <label
                    className={cx(
                      "flex cursor-pointer items-start gap-3 rounded-control border-2 p-3.5",
                      "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--focus)",
                      pick === "own" ? "border-primary bg-surface-2" : "border-line bg-surface",
                    )}
                  >
                    <input
                      type="radio"
                      name="lie"
                      className="mt-1 size-5 accent-(--primary)"
                      checked={pick === "own"}
                      onChange={() => {
                        setPick("own");
                        setFieldError(null);
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-lg font-semibold">Write my own lie</span>
                      {pick === "own" ? (
                        <span className="mt-2 block">
                          <textarea
                            aria-label="Your own lie"
                            value={ownLie}
                            onChange={(event) => {
                              setOwnLie(event.target.value.slice(0, MAX));
                              setFieldError(null);
                            }}
                            rows={2}
                            placeholder="Something false that sounds like you"
                            className="w-full rounded-control border-2 border-control bg-surface px-3 py-2 text-ink"
                          />
                          <span className="tabular block text-right text-sm text-ink-soft">
                            {ownLie.length}/{MAX}
                          </span>
                        </span>
                      ) : null}
                    </span>
                  </label>
                ) : null}
              </fieldset>

              {fieldError ? <Notice>{fieldError}</Notice> : null}
              {action.error ? <Notice>{action.error}</Notice> : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="accent"
                  size="lg"
                  icon="check"
                  busy={action.busy === "lock"}
                  disabled={pick === null}
                  onClick={lockIn}
                >
                  Lock in my card
                </Button>
                {source !== null && draftsLeft > 0 ? (
                  <Button
                    variant="quiet"
                    icon="refresh"
                    busy={action.busy === "forge"}
                    onClick={forge}
                  >
                    {aiReady ? "New lies" : "Try the AI again"} ({draftsLeft} left)
                  </Button>
                ) : null}
                {source === null && draftsLeft > 0 ? (
                  <Button
                    variant="quiet"
                    icon="sparkle"
                    busy={action.busy === "forge"}
                    onClick={forge}
                  >
                    Let the AI try
                  </Button>
                ) : null}
              </div>
            </Panel>
          ) : null}
        </div>
      )}
    </div>
  );
}

function TruthField({
  index,
  value,
  locked,
  onChange,
  onFocus,
}: {
  index: 0 | 1;
  value: string;
  locked: boolean;
  onChange: (value: string) => void;
  onFocus: () => void;
}) {
  const id = `truth-${index}`;
  const dictation = useDictation((text) => {
    const joined = value.trim() ? `${value.trim()} ${text}` : text;
    onChange(joined.charAt(0).toUpperCase() + joined.slice(1));
  });

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-display font-semibold">
        Truth {index + 1}
      </label>
      <div className="flex items-stretch gap-2">
        <textarea
          id={id}
          value={value}
          readOnly={locked}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          rows={2}
          maxLength={MAX}
          placeholder={
            index === 0 ? "I have never eaten a banana." : "I once got locked in a museum overnight."
          }
          aria-describedby={`${id}-count`}
          className={cx(
            "w-full min-w-0 rounded-control border-2 px-3.5 py-2.5 text-lg text-ink placeholder:text-ink-soft/60",
            locked ? "border-line bg-surface-2" : "border-control bg-surface",
          )}
        />
        {dictation.supported && !locked ? (
          <button
            type="button"
            onClick={dictation.listening ? dictation.stop : dictation.start}
            aria-pressed={dictation.listening}
            aria-label={
              dictation.listening
                ? `Stop listening for truth ${index + 1}`
                : `Say truth ${index + 1} aloud`
            }
            title={dictation.listening ? "Listening. Tap to stop." : "Say it aloud"}
            className={cx(
              "flex w-12 shrink-0 items-center justify-center rounded-control border-2",
              dictation.listening
                ? "animate-pulse border-bad bg-bad-bg text-bad"
                : "border-control bg-surface text-ink",
            )}
          >
            <Icon name="mic" />
          </button>
        ) : null}
      </div>
      <p id={`${id}-count`} className="tabular mt-1 text-right text-sm text-ink-soft">
        {dictation.listening ? "Listening… " : ""}
        {value.length}/{MAX}
      </p>
    </div>
  );
}
