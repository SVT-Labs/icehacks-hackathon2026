"use client";

import { useState } from "react";
import { Penguin } from "@/components/Penguin";
import { Notice, Tag, cx } from "@/components/ui";
import { errorMessage } from "@/lib/client/api";
import { sfx } from "@/lib/client/sfx";
import type { Choice } from "@/lib/types";
import { Countdown } from "./Countdown";
import { LETTERS, type GameCtx } from "./shared";

export function Guessing({ ctx }: { ctx: GameCtx }) {
  const { api, code, token, room, me, meId, now } = ctx;
  const [local, setLocal] = useState<Choice | null>(null);
  const [error, setError] = useState<string | null>(null);

  const card = room.card;
  if (!card) return null;

  const author = room.players[card.authorId];
  const self = room.players[meId];
  const isAuthor = card.authorId === meId;
  const joinedLate =
    !isAuthor &&
    self !== undefined &&
    room.phaseStartedAt !== null &&
    self.joinedAt > room.phaseStartedAt;

  const myGuess = local ?? me?.myGuess ?? null;
  const locked = myGuess !== null || card.guessedIds.includes(meId);
  const canGuess = !isAuthor && !joinedLate && !locked;

  const guessers = Object.values(room.players).filter(
    (p) =>
      p.id !== card.authorId &&
      (room.phaseStartedAt === null || p.joinedAt <= room.phaseStartedAt),
  );
  const done = guessers.filter((p) => {
    const botAt = card.botGuessAt[p.id];
    return card.guessedIds.includes(p.id) || (botAt !== undefined && botAt <= now);
  }).length;

  async function choose(choice: Choice) {
    if (!canGuess) return;
    setLocal(choice);
    setError(null);
    sfx.lock();
    try {
      await api.guess(code, token, { seq: room.seq, choice });
    } catch (e) {
      setLocal(null);
      setError(errorMessage(e));
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display font-semibold text-ink-soft">
            Round {room.round} · card {room.cardIndex + 1} of {room.order.length}
          </p>
          <h1 className="mt-1 flex items-center gap-3 text-3xl font-bold sm:text-4xl">
            {author ? <Penguin avatar={author.avatar} className="h-14 w-12 shrink-0" /> : null}
            <span className="min-w-0">
              {isAuthor
                ? "Your card is up"
                : `Which one did ${author?.name ?? "they"} make up?`}
            </span>
          </h1>
        </div>
        <Countdown
          startedAt={room.phaseStartedAt}
          endsAt={room.phaseEndsAt}
          now={now}
          label="Time to guess"
        />
      </div>

      <p className="mt-3 text-lg text-ink-soft" aria-live="polite">
        {isAuthor
          ? "Keep a straight face while they guess."
          : joinedLate
            ? "You joined while this card was up. You are in from the next one."
            : locked
              ? "Locked in. Waiting for the others."
              : "Two of these are true. Tap the lie."}
      </p>

      <ol className="mt-5 space-y-3">
        {card.statements.map((text, index) => {
          const choice = index as Choice;
          const mine = myGuess === choice;
          const ownLie = isAuthor && me?.card?.lieIndex === choice;
          return (
            <li key={index}>
              <button
                type="button"
                disabled={!canGuess}
                aria-pressed={isAuthor || joinedLate ? undefined : mine}
                onClick={() => choose(choice)}
                style={{ "--lip": mine ? "var(--primary-lip)" : "var(--line)" } as React.CSSProperties}
                className={cx(
                  "lip flex w-full items-center gap-4 rounded-card border-2 p-4 text-left sm:p-5",
                  canGuess && "lip-press cursor-pointer hover:border-primary",
                  mine ? "border-primary bg-surface-2" : "border-line bg-surface",
                  !canGuess && !mine && locked && "opacity-70",
                )}
              >
                <span
                  className={cx(
                    "flex size-11 shrink-0 items-center justify-center rounded-full font-display text-xl font-bold",
                    mine ? "bg-primary text-primary-ink" : "bg-surface-2 text-ink",
                  )}
                  aria-hidden="true"
                >
                  {LETTERS[index]}
                </span>
                <span className="min-w-0 flex-1 text-xl leading-snug">
                  <span className="sr-only">Statement {LETTERS[index]}: </span>
                  {text}
                  {mine ? (
                    <span className="mt-1.5 block">
                      <Tag tone="neutral" icon="check">
                        Your pick
                      </Tag>
                    </span>
                  ) : null}
                  {ownLie ? (
                    <span className="mt-1.5 block">
                      <Tag tone="ai" icon={me?.card?.lieSource === "ai" ? "sparkle" : "pencil"}>
                        Your lie
                      </Tag>
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {error ? (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      ) : null}

      <p className="tabular mt-5 font-semibold text-ink-soft">
        {done} of {guessers.length} guesses are in.
      </p>
    </div>
  );
}
