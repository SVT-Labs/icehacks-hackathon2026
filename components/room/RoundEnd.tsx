"use client";

import { useEffect, useState } from "react";
import { PenguinOnIce } from "@/components/PenguinOnIce";
import { Sea } from "@/components/Sea";
import { Button, Notice, Tag, cx } from "@/components/ui";
import { sfx } from "@/lib/client/sfx";
import { byScore, clock, playersInOrder, signed, useAction, type GameCtx } from "./shared";

export function RoundEnd({ ctx }: { ctx: GameCtx }) {
  const { api, code, token, room, meId, isHost, now } = ctx;
  const action = useAction();
  const summary = room.roundSummary;
  const splashed = summary?.splashedIds ?? [];

  const [broken, setBroken] = useState(false);
  const anySplash = splashed.length > 0;
  useEffect(() => {
    if (!anySplash) return;
    const crack = window.setTimeout(() => sfx.crack(), 500);
    const fall = window.setTimeout(() => {
      setBroken(true);
      sfx.splash();
    }, 1100);
    return () => {
      window.clearTimeout(crack);
      window.clearTimeout(fall);
    };
  }, [anySplash]);

  const ranked = byScore(room);
  const top = ranked[0]?.score ?? 0;
  const lastRound = top >= room.settings.targetScore || room.round >= room.settings.maxRounds;
  const left = room.phaseEndsAt === null ? null : room.phaseEndsAt - now;

  return (
    <div className="mx-auto max-w-3xl">
      <p className="font-display font-semibold text-ink-soft">
        Round {room.round} of {room.settings.maxRounds}
      </p>
      <h1 className="text-4xl font-bold">
        {anySplash
          ? splashed.length === 1
            ? "The ice gave way"
            : "The ice gave way under a few of you"
          : "Everyone stayed dry"}
      </h1>
      <p className="mt-2 text-lg text-ink-soft" aria-live="polite">
        {lastRound ? "Final results" : `Round ${room.round + 1} starts`}
        {left !== null ? ` in ${clock(left)}` : " soon"}.{" "}
        {lastRound ? "" : "Think of two new truths."}
      </p>

      <Sea className="mt-16 rounded-card">
        <ul
          aria-hidden="true"
          className="flex flex-wrap items-end justify-center gap-x-3 gap-y-6 px-3 pb-5"
          style={{ marginTop: -52 }}
        >
          {playersInOrder(room).map((player) => (
            <li key={player.id} className="flex w-24 flex-col items-center">
              <PenguinOnIce
                avatar={player.avatar}
                cracks={player.cracks}
                broken={broken && splashed.includes(player.id)}
                mood={splashed.includes(player.id) ? "nervous" : player.cracks === 0 ? "happy" : undefined}
                size={92}
              />
              <span className="mt-1 w-full truncate text-center text-sm font-bold text-white">
                {player.name}
              </span>
            </li>
          ))}
        </ul>
      </Sea>

      <ol className="mt-6 space-y-2" aria-label="Scores">
        {ranked.map((player, index) => {
          const delta = summary?.deltas[player.id] ?? 0;
          const share = Math.min(1, player.score / Math.max(1, room.settings.targetScore));
          return (
            <li
              key={player.id}
              className={cx(
                "rounded-control border-2 bg-surface px-3.5 py-2.5",
                player.id === meId ? "border-primary" : "border-line",
              )}
            >
              <div className="flex items-center gap-3">
                <span className="tabular w-6 font-display text-lg font-bold text-ink-soft">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate font-display text-lg font-semibold">
                  {player.name}
                  {player.id === meId ? <span className="text-ink-soft"> (you)</span> : null}
                </span>
                {splashed.includes(player.id) ? (
                  <Tag tone="bad" icon="drop">
                    Fell in
                  </Tag>
                ) : null}
                <span
                  className={cx(
                    "tabular w-14 text-right font-bold",
                    delta > 0 ? "text-good" : delta < 0 ? "text-bad" : "text-ink-soft",
                  )}
                >
                  {signed(delta)}
                </span>
                <span className="tabular w-14 text-right font-display text-xl font-bold">
                  {player.score}
                </span>
              </div>
              <div
                className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2"
                role="img"
                aria-label={`${player.score} of ${room.settings.targetScore} points`}
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-700"
                  style={{ width: `${share * 100}%` }}
                />
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-sm text-ink-soft">
        The bar shows how close each player is to the winning score of{" "}
        {room.settings.targetScore}.
      </p>

      {action.error ? (
        <div className="mt-4">
          <Notice>{action.error}</Notice>
        </div>
      ) : null}
      {isHost ? (
        <div className="mt-5">
          <Button
            icon="skip"
            busy={action.busy === "skip"}
            onClick={() => action.run("skip", () => api.host(code, token, { action: "skip" }))}
          >
            {lastRound ? "Show the results" : "Start the next round"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
