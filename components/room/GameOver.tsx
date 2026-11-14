"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { Penguin } from "@/components/Penguin";
import { PenguinOnIce } from "@/components/PenguinOnIce";
import { Sea } from "@/components/Sea";
import { Button, Notice, Panel, cx } from "@/components/ui";
import type { Learned, Player } from "@/lib/types";
import { byScore, useAction, type GameCtx } from "./shared";

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "Nobody";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function GameOver({ ctx }: { ctx: GameCtx }) {
  const { api, code, token, room, meId, isHost } = ctx;
  const action = useAction();
  const [copied, setCopied] = useState(false);
  const result = room.result;
  const ranked = byScore(room);
  const winners = (result?.winnerIds ?? [])
    .map((id) => room.players[id])
    .filter((p): p is Player => p !== undefined);
  const iWon = winners.some((p) => p.id === meId);
  const podium = ranked.slice(0, 3);

  // Group the truths by who wrote them, people before bots.
  const groups = new Map<string, { name: string; isBot: boolean; truths: string[] }>();
  for (const item of result?.learned ?? ([] as Learned[])) {
    const group = groups.get(item.playerId) ?? {
      name: item.name,
      isBot: room.players[item.playerId]?.isBot ?? item.playerId.startsWith("bot_"),
      truths: [],
    };
    if (!group.truths.includes(item.truth)) group.truths.push(item.truth);
    groups.set(item.playerId, group);
  }
  const learned = [...groups.values()].sort((a, b) => Number(a.isBot) - Number(b.isBot));

  async function copyResults() {
    const lines = [
      `Thin Ice: ${joinNames(winners.map((p) => p.name))} won!`,
      ...ranked.map((p, i) => `${i + 1}. ${p.name} ${p.score}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      action.setError("Could not copy the results.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <p className="font-display font-semibold text-ink-soft">Game over</p>
      <h1 className="text-4xl font-bold sm:text-5xl">
        {iWon && winners.length === 1
          ? "You win!"
          : `${joinNames(winners.map((p) => p.name))} ${winners.length === 1 ? "wins" : "win"}!`}
      </h1>

      <Sea className="mt-20 rounded-card">
        <ol
          className="flex items-end justify-center gap-2 px-3 pb-5 sm:gap-8"
          style={{ marginTop: -70 }}
          aria-label="Top three"
        >
          {[podium[1], podium[0], podium[2]].map((player, slot) =>
            player ? (
              <li
                key={player.id}
                className={cx("flex flex-col items-center", slot === 1 ? "order-2" : slot === 0 ? "order-1 translate-y-3" : "order-3 translate-y-3")}
              >
                <PenguinOnIce
                  avatar={player.avatar}
                  mood={slot === 1 ? "happy" : "idle"}
                  size={slot === 1 ? 128 : 96}
                />
                <span
                  className={cx(
                    "mt-1 truncate text-center font-display text-lg font-bold text-white",
                    slot === 1 ? "max-w-44" : "max-w-28",
                  )}
                >
                  {slot === 1 ? "1." : slot === 0 ? "2." : "3."} {player.name}
                </span>
                <span className="tabular font-semibold text-white/85">{player.score}</span>
              </li>
            ) : null,
          )}
        </ol>
      </Sea>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Award
          icon="sparkle"
          title="Best liar"
          player={result?.bestLiarId ? room.players[result.bestLiarId] : undefined}
          text="Fooled the most players."
        />
        <Award
          icon="eye"
          title="Sharpest eye"
          player={result?.sharpestEyeId ? room.players[result.sharpestEyeId] : undefined}
          text="Spotted the most lies."
        />
      </div>

      {ranked.length > 3 ? (
        <ol start={4} className="mt-4 space-y-1.5" aria-label="Other players">
          {ranked.slice(3).map((player, index) => (
            <li
              key={player.id}
              className="flex items-center gap-3 rounded-control border-2 border-line bg-surface px-3.5 py-2"
            >
              <span className="tabular w-6 font-display font-bold text-ink-soft">{index + 4}</span>
              <Penguin avatar={player.avatar} className="h-8 w-7" />
              <span className="min-w-0 flex-1 truncate font-semibold">{player.name}</span>
              <span className="tabular font-display text-lg font-bold">{player.score}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {learned.length > 0 ? (
        <Panel as="section" className="mt-6">
          <h2 className="text-2xl font-semibold">What you learned about each other</h2>
          <p className="mt-1 text-ink-soft">Every one of these is true. Ask about them.</p>
          <dl className="mt-4 space-y-4">
            {learned.map((group) => (
              <div key={group.name}>
                <dt className="font-display text-lg font-semibold">
                  {group.name}
                  {group.isBot ? <span className="font-sans text-sm text-ink-soft"> (bot)</span> : null}
                </dt>
                {group.truths.map((truth) => (
                  <dd key={truth} className="mt-1 flex items-start gap-2">
                    <Icon name="check" size={18} className="mt-1 shrink-0 text-good" />
                    <span>{truth}</span>
                  </dd>
                ))}
              </div>
            ))}
          </dl>
        </Panel>
      ) : null}

      {action.error ? (
        <div className="mt-4">
          <Notice>{action.error}</Notice>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        {isHost ? (
          <Button
            variant="accent"
            size="lg"
            icon="refresh"
            busy={action.busy === "again"}
            onClick={() =>
              action.run("again", () => api.host(code, token, { action: "playAgain" }))
            }
          >
            Play again
          </Button>
        ) : (
          <p className="flex items-center gap-2 font-semibold text-ink-soft">
            <Icon name="clock" /> The host can start another game.
          </p>
        )}
        <Button variant="quiet" icon={copied ? "check" : "copy"} onClick={copyResults}>
          {copied ? "Copied" : "Copy the scores"}
        </Button>
        <Link
          href="/"
          className="inline-flex min-h-12 items-center gap-2 rounded-control px-3 font-display font-semibold text-primary underline underline-offset-2"
        >
          <Icon name="home" /> Home
        </Link>
      </div>
      <p className="sr-only" aria-live="polite">
        {copied ? "Scores copied." : ""}
      </p>
    </div>
  );
}

function Award({
  icon,
  title,
  player,
  text,
}: {
  icon: IconName;
  title: string;
  player: Player | undefined;
  text: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-card border-2 border-gold/50 bg-gold-bg p-4">
      {player ? (
        <Penguin avatar={player.avatar} mood="happy" className="h-14 w-12 shrink-0" />
      ) : (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface text-gold">
          <Icon name={icon} />
        </span>
      )}
      <p className="min-w-0">
        <span className="flex items-center gap-1.5 font-display font-semibold text-gold">
          <Icon name={icon} size={16} /> {title}
        </span>
        <span className="block truncate font-display text-xl font-bold">
          {player?.name ?? "Nobody this time"}
        </span>
        <span className="block text-sm text-ink-soft">{player ? text : "No one earned it."}</span>
      </p>
    </div>
  );
}
