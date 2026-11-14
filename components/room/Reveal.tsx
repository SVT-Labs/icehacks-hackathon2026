"use client";

import { Icon } from "@/components/Icon";
import { Penguin } from "@/components/Penguin";
import { Button, Notice, Tag, cx } from "@/components/ui";
import type { Choice, Player } from "@/lib/types";
import { Countdown } from "./Countdown";
import { LETTERS, signed, useAction, type GameCtx } from "./shared";

/** The answer to the card that was just guessed. */
export function Reveal({ ctx }: { ctx: GameCtx }) {
  const { api, code, token, room, meId, isHost, now } = ctx;
  const action = useAction();
  const card = room.card;
  const reveal = room.reveal;
  if (!card || !reveal) return null;

  const author = room.players[card.authorId];
  const authorName = author?.name ?? "The author";
  const isAuthor = card.authorId === meId;
  const myDelta = reveal.deltas[meId];
  const myPick = reveal.picks[meId];

  const pickers = (choice: Choice): Player[] =>
    Object.entries(reveal.picks)
      .filter(([, pick]) => pick === choice)
      .map(([id]) => room.players[id])
      .filter((p): p is Player => p !== undefined);

  const fooled = Object.values(reveal.picks).filter(
    (pick) => pick !== reveal.lieIndex,
  ).length;
  const guesserCount = Object.keys(reveal.deltas).filter(
    (id) => id !== card.authorId,
  ).length;

  let headline: string;
  let detail: string;
  let tone: "good" | "bad" | "quiet";
  if (isAuthor) {
    tone = (myDelta ?? 0) > 0 ? "good" : (myDelta ?? 0) < 0 ? "bad" : "quiet";
    headline =
      fooled === 0
        ? "Nobody fell for it"
        : `You fooled ${fooled} of ${guesserCount}`;
    detail =
      (myDelta ?? 0) < 0
        ? "Too many players spotted your lie, so it cost you points and cracked your ice."
        : fooled === 0
          ? "Everyone who answered spotted the lie."
          : reveal.lieSource === "ai"
            ? "The AI lie earned you the bonus."
            : "Your own lie did the job.";
  } else if (myDelta === undefined) {
    tone = "quiet";
    headline = "You sat this one out";
    detail = "You are in from the next card.";
  } else if (myPick === undefined) {
    tone = "bad";
    headline = "Out of time";
    detail = "No guess counts as a wrong one. Your ice cracked.";
  } else if (myPick === reveal.lieIndex) {
    tone = "good";
    headline = "You spotted the lie";
    detail = "The other two are true.";
  } else {
    tone = "bad";
    headline = "Fooled! That one is true";
    detail = "Your ice cracked.";
  }

  return (
    <div className="mx-auto max-w-2xl lg:max-w-none">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display font-semibold text-ink-soft">
            Round {room.round} · card {room.cardIndex + 1} of{" "}
            {room.order.length}
          </p>
          <h1 className="mt-1 flex items-center gap-3 text-3xl font-bold sm:text-4xl">
            {author ? (
              <Penguin avatar={author.avatar} className="h-14 w-12 shrink-0" />
            ) : null}
            <span className="min-w-0">
              {isAuthor
                ? "Your card, revealed"
                : `${authorName}’s card, revealed`}
            </span>
          </h1>
        </div>
        <Countdown
          startedAt={room.phaseStartedAt}
          endsAt={room.phaseEndsAt}
          now={now}
          label="Next card in"
          paused={room.held}
        />
      </div>

      {/* One column on phones (result, answer, story, buttons). On wide
          screens the answer is on the left and the rest beside it. */}
      <div className="mt-4 flex flex-col gap-4 lg:grid lg:grid-cols-[1.35fr_1fr] lg:items-start">
        <ol className="order-2 space-y-3 lg:order-none">
          {card.statements.map((text, index) => {
            const choice = index as Choice;
            const isLie = reveal.lieIndex === choice;
            const who = pickers(choice);
            return (
              <li
                key={index}
                className={cx(
                  "rounded-card border-2 p-4 sm:p-5",
                  isLie ? "border-ai bg-ai-bg" : "border-line bg-surface",
                )}
              >
                <div className="flex items-start gap-4">
                  <span
                    className={cx(
                      "flex size-11 shrink-0 items-center justify-center rounded-full font-display text-xl font-bold",
                      isLie
                        ? "bg-ai text-white dark:text-(--sky)"
                        : "bg-good-bg text-good",
                    )}
                    aria-hidden="true"
                  >
                    {LETTERS[index]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cx(
                        "text-xl leading-snug",
                        isLie && "line-through decoration-2",
                      )}
                    >
                      {text}
                    </p>
                    <p className="mt-2 flex flex-wrap items-center gap-2">
                      {isLie ? (
                        <>
                          <Tag tone="ai" icon="flag">
                            The lie
                          </Tag>
                          <Tag
                            tone="ai"
                            icon={
                              reveal.lieSource === "ai" ? "sparkle" : "pencil"
                            }
                          >
                            {reveal.lieSource === "ai"
                              ? "Written by the AI"
                              : `Written by ${authorName}`}
                          </Tag>
                        </>
                      ) : (
                        <Tag tone="good" icon="check">
                          True
                        </Tag>
                      )}
                    </p>
                    {who.length > 0 ? (
                      <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-ink-soft">
                        <span>{isLie ? "Spotted by" : "Fooled"}</span>
                        {who.map((p) => (
                          <span
                            key={p.id}
                            className="inline-flex items-center gap-1 text-ink"
                          >
                            <Penguin avatar={p.avatar} className="h-6 w-5" />
                            {p.name}
                          </span>
                        ))}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="contents lg:flex lg:flex-col lg:gap-4">
          <div
            role="status"
            className={cx(
              "animate-pop order-1 flex items-center gap-4 rounded-card border-2 p-4 lg:order-none",
              tone === "good" && "border-good/40 bg-good-bg",
              tone === "bad" && "border-bad/40 bg-bad-bg",
              tone === "quiet" && "border-line bg-surface-2",
            )}
          >
            {myDelta !== undefined ? (
              <span
                className={cx(
                  "tabular font-display text-4xl font-bold",
                  tone === "good" && "text-good",
                  tone === "bad" && "text-bad",
                )}
              >
                {signed(myDelta)}
              </span>
            ) : null}
            <span>
              <span className="block font-display text-xl font-semibold">
                {headline}
              </span>
              <span className="block text-ink-soft">{detail}</span>
            </span>
          </div>

          {reveal.starter ? (
            <div className="order-3 flex items-start gap-3 rounded-card border-2 border-dashed border-gold/60 bg-gold-bg p-4 lg:order-none">
              <Icon name="users" className="mt-1 shrink-0 text-gold" />
              <p>
                <span className="block font-display font-semibold text-gold">
                  Story time
                </span>
                <span className="text-lg">{reveal.starter}</span>
              </p>
            </div>
          ) : null}

          {action.error ? (
            <div className="order-4 lg:order-none">
              <Notice>{action.error}</Notice>
            </div>
          ) : null}

          {isHost ? (
            <div className="order-5 flex flex-wrap gap-3 lg:order-none">
              <Button
                variant="quiet"
                icon={room.held ? "play" : "pause"}
                busy={action.busy === "hold"}
                onClick={() =>
                  action.run("hold", () =>
                    api.host(code, token, { action: "hold" }),
                  )
                }
              >
                {room.held ? "Carry on" : "Hold for the story"}
              </Button>
              <Button
                icon="skip"
                busy={action.busy === "skip"}
                onClick={() =>
                  action.run("skip", () =>
                    api.host(code, token, { action: "skip" }),
                  )
                }
              >
                Next
              </Button>
            </div>
          ) : room.held ? (
            <p className="order-5 font-semibold text-ink-soft lg:order-none">
              The host paused the game for the story.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
