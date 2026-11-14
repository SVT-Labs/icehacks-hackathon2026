"use client";

import { Icon } from "@/components/Icon";
import { PenguinOnIce } from "@/components/PenguinOnIce";
import { Sea } from "@/components/Sea";
import { cx } from "@/components/ui";
import type { Player, PublicRoom } from "@/lib/types";
import { playersInOrder, signed } from "./shared";

/**
 * The strip of water along the bottom of the game: every player as a penguin
 * on an ice floe, with their score and what they are doing right now.
 */
export function PlayerSea({
  room,
  meId,
  now,
  onKick,
}: {
  room: PublicRoom;
  meId: string;
  now: number;
  /** Given to the host in the lobby: removes another player. */
  onKick?: (playerId: string) => void;
}) {
  const players = playersInOrder(room);
  return (
    // Pinned to the bottom of the window on screens tall enough to spare the
    // room; on short ones it sits at the end of the page instead. The strip of
    // sky above the water is solid, so the page scrolls underneath it and the
    // penguins never sit on top of a card.
    <div className="bottom-0 z-10 mt-6 [@media(min-height:720px)]:sticky">
      <div
        className="h-5 bg-linear-to-b from-transparent to-sky"
        aria-hidden="true"
      />
      <div className="bg-sky pt-[3.25rem]">
        <Sea>
          <ul
            aria-label="Players"
            className="quiet-scroll mx-auto flex max-w-5xl items-end gap-1 justify-center-safe overflow-x-auto px-3 pb-2 sm:gap-3"
            style={{ marginTop: -44 }}
          >
            {players.map((player) => (
              <li
                key={player.id}
                className="flex w-[6.25rem] shrink-0 flex-col items-center"
              >
                <Status room={room} player={player} now={now} />
                <PenguinOnIce
                  avatar={player.avatar}
                  cracks={player.cracks}
                  size={68}
                />
                <p
                  className={cx(
                    "mt-0.5 w-full truncate text-center text-sm font-bold text-white",
                    player.id === meId &&
                      "underline decoration-accent decoration-2 underline-offset-2",
                  )}
                >
                  {player.name}
                  {player.id === meId ? (
                    <span className="sr-only"> (you)</span>
                  ) : null}
                </p>
                {onKick && player.id !== meId && !player.isBot ? (
                  <button
                    type="button"
                    onClick={() => onKick(player.id)}
                    aria-label={`Remove ${player.name} from the lobby`}
                    className="mt-0.5 rounded-md bg-white/15 px-2 text-sm font-semibold text-white hover:bg-white/25"
                  >
                    Remove
                  </button>
                ) : (
                  <p className="tabular text-sm font-semibold text-white/85">
                    {room.phase === "lobby" ? (player.isBot ? "bot" : " ") : player.score}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Sea>
      </div>
    </div>
  );
}

function Chip({
  tone,
  children,
}: {
  tone: "good" | "bad" | "quiet" | "gold";
  children: React.ReactNode;
}) {
  const tones = {
    good: "bg-good-bg text-good",
    bad: "bg-bad-bg text-bad",
    quiet: "bg-surface text-ink-soft",
    gold: "bg-gold-bg text-gold",
  } as const;
  return (
    <span
      className={cx(
        "tabular mb-1 inline-flex h-6 items-center gap-0.5 rounded-md px-1.5 text-xs font-bold",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

const Empty = () => <span className="mb-1 block h-6" aria-hidden="true" />;

function Status({
  room,
  player,
  now,
}: {
  room: PublicRoom;
  player: Player;
  now: number;
}) {
  if (room.phase === "lobby") {
    return player.isHost ? (
      <Chip tone="gold">
        <Icon name="crown" size={13} /> Host
      </Chip>
    ) : (
      <Empty />
    );
  }

  if (room.phase === "writing") {
    return player.ready ? (
      <Chip tone="good">
        <Icon name="check" size={13} /> Ready
      </Chip>
    ) : (
      <Chip tone="quiet">Writing</Chip>
    );
  }

  if (room.phase === "guessing" && room.card) {
    if (player.id === room.card.authorId)
      return <Chip tone="gold">Author</Chip>;
    const botAt = room.card.botGuessAt[player.id];
    const guessed =
      room.card.guessedIds.includes(player.id) ||
      (botAt !== undefined && botAt <= now);
    return guessed ? (
      <Chip tone="good">
        <Icon name="check" size={13} /> In
      </Chip>
    ) : (
      <Chip tone="quiet">Thinking</Chip>
    );
  }

  if (room.phase === "reveal" && room.reveal) {
    const delta = room.reveal.deltas[player.id];
    if (delta === undefined) return <Empty />;
    return (
      <Chip tone={delta > 0 ? "good" : delta < 0 ? "bad" : "quiet"}>
        {signed(delta)}
      </Chip>
    );
  }

  return <Empty />;
}
