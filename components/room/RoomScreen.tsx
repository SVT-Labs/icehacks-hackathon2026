"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Penguin } from "@/components/Penguin";
import { SiteHeader } from "@/components/SiteHeader";
import { Button, Panel } from "@/components/ui";
import { sfx } from "@/lib/client/sfx";
import { useRoom, useServerNow } from "@/lib/client/useRoom";
import type { Phase } from "@/lib/types";
import { GameOver } from "./GameOver";
import { Guessing } from "./Guessing";
import { JoinGate } from "./JoinGate";
import { Lobby } from "./Lobby";
import { PlayerSea } from "./PlayerSea";
import { Reveal } from "./Reveal";
import { RoundEnd } from "./RoundEnd";
import { Writing } from "./Writing";
import type { GameCtx } from "./shared";

const ANNOUNCE: Record<Phase, string> = {
  lobby: "You are in the lobby.",
  writing: "Writing time. Write two true things about yourself.",
  guessing: "A new card is up. Pick the lie.",
  reveal: "The answer is revealed.",
  roundEnd: "The round is over. Here are the scores.",
  gameOver: "The game is over.",
};

export function RoomScreen({ code }: { code: string }) {
  const router = useRouter();
  const { api, room, status, identity, setIdentity, me, refreshMe, inRoom } = useRoom(code);
  const running = Boolean(room && room.phase !== "lobby" && room.phase !== "gameOver");
  const now = useServerNow(api, running);

  const meId = identity?.playerId ?? "";
  const token = identity?.token ?? "";
  const seq = room?.seq;
  const endsAt = room?.phaseEndsAt ?? null;

  // When a countdown runs out, ask the server to move on. Every player's
  // browser does this; the server ignores all but the first.
  useEffect(() => {
    if (!api || !inRoom || !token || endsAt === null || seq === undefined) return;
    let timer: number;
    const fire = () => {
      api.tick(code, token, seq).catch(() => {});
      timer = window.setTimeout(fire, 2500);
    };
    const wait = Math.max(0, endsAt - api.now()) + 80 + Math.random() * 300;
    timer = window.setTimeout(fire, wait);
    return () => window.clearTimeout(timer);
  }, [api, code, token, inRoom, endsAt, seq]);

  // Sounds for what just happened to this player.
  const lastSeq = useRef<number | null>(null);
  useEffect(() => {
    if (!room || !inRoom) return;
    if (lastSeq.current === null || lastSeq.current === room.seq) {
      lastSeq.current = room.seq;
      return;
    }
    lastSeq.current = room.seq;
    if (room.phase === "writing" || room.phase === "guessing") sfx.pop();
    if (room.phase === "gameOver") sfx.fanfare();
    if (room.phase === "reveal") {
      const delta = room.reveal?.deltas[meId];
      if (delta !== undefined && delta > 0) sfx.correct();
      if (delta !== undefined && delta < 0) {
        sfx.wrong();
        window.setTimeout(() => sfx.crack(), 260);
      }
    }
  }, [room, inRoom, meId]);

  // A soft pop when someone walks into the lobby.
  const headcount = room ? Object.keys(room.players).length : 0;
  const lastCount = useRef(0);
  useEffect(() => {
    if (room?.phase === "lobby" && lastCount.current > 0 && headcount > lastCount.current) {
      sfx.pop();
    }
    lastCount.current = headcount;
  }, [headcount, room?.phase]);

  // Ticking for the last five seconds of a guess this player still owes.
  const secondsLeft = endsAt === null ? null : Math.ceil((endsAt - now) / 1000);
  const owesGuess =
    room?.phase === "guessing" &&
    room.card !== null &&
    room.card.authorId !== meId &&
    !room.card.guessedIds.includes(meId);
  useEffect(() => {
    if (owesGuess && secondsLeft !== null && secondsLeft > 0 && secondsLeft <= 5) sfx.tick();
  }, [owesGuess, secondsLeft]);

  if (status === "loading" || !api) {
    return (
      <>
        <SiteHeader />
        <Centered title="Finding the room" text="One moment." busy />
      </>
    );
  }

  if (status === "missing" || !room) {
    return (
      <>
        <SiteHeader />
        <Centered
          title={status === "error" ? "The room would not load" : "This room has melted"}
          text={
            status === "error"
              ? "The connection to the game dropped. Check your internet and try again."
              : `There is no room with the code ${code}. Rooms are removed after a day, and the code may have a typo.`
          }
        >
          {status === "error" ? (
            <Button icon="refresh" onClick={() => window.location.reload()}>
              Try again
            </Button>
          ) : null}
          <Link href="/" className="font-bold text-primary underline underline-offset-2">
            Start a new lobby
          </Link>
        </Centered>
      </>
    );
  }

  if (!inRoom || !identity) {
    return (
      <>
        <SiteHeader />
        <JoinGate api={api} code={code} room={room} onJoined={setIdentity} />
      </>
    );
  }

  const ctx: GameCtx = {
    api,
    code,
    token,
    meId,
    isHost: room.hostId === meId,
    room,
    me,
    refreshMe,
    now,
  };

  async function leave() {
    try {
      await api?.leave(code, token);
    } catch {
      // Leaving is best effort; the player goes home either way.
    }
    setIdentity(null);
    router.push("/");
  }

  const showSea = room.phase !== "roundEnd" && room.phase !== "gameOver";

  return (
    <>
      <SiteHeader>
        {room.phase !== "lobby" ? (
          <span
            className="hidden rounded-control border-2 border-line bg-surface px-2.5 py-1.5 font-display font-semibold tracking-widest sm:inline"
            title="Room code"
          >
            <span className="sr-only">Room code </span>
            {code}
          </span>
        ) : null}
        <LeaveButton onLeave={leave} />
      </SiteHeader>

      <p className="sr-only" aria-live="polite">
        {ANNOUNCE[room.phase]}
      </p>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-8 pt-6 sm:px-6 sm:pt-8">
        {room.phase === "lobby" ? <Lobby ctx={ctx} /> : null}
        {room.phase === "writing" ? <Writing key={`w${room.round}`} ctx={ctx} /> : null}
        {room.phase === "guessing" ? <Guessing key={`g${room.seq}`} ctx={ctx} /> : null}
        {room.phase === "reveal" ? <Reveal ctx={ctx} /> : null}
        {room.phase === "roundEnd" ? <RoundEnd key={`r${room.round}`} ctx={ctx} /> : null}
        {room.phase === "gameOver" ? <GameOver ctx={ctx} /> : null}
      </main>

      {showSea ? <PlayerSea room={room} meId={meId} now={now} /> : null}
    </>
  );
}

function Centered({
  title,
  text,
  busy = false,
  children,
}: {
  title: string;
  text: string;
  busy?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      <Panel className="space-y-4 text-center">
        <Penguin
          avatar="navy"
          mood={busy ? "idle" : "sad"}
          className="mx-auto h-24 w-20"
        />
        <h1 className="text-3xl font-bold" role={busy ? "status" : undefined}>
          {title}
        </h1>
        <p className="text-ink-soft">{text}</p>
        {children ? (
          <div className="flex flex-wrap items-center justify-center gap-4">{children}</div>
        ) : null}
      </Panel>
    </main>
  );
}

/** Asks once more before leaving, without a browser pop-up. */
function LeaveButton({ onLeave }: { onLeave: () => void }) {
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!asking) return;
    const timer = window.setTimeout(() => setAsking(false), 4000);
    return () => window.clearTimeout(timer);
  }, [asking]);

  return asking ? (
    <button
      type="button"
      onClick={onLeave}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-control border-2 border-bad/50 bg-bad-bg px-3 font-display font-semibold text-bad"
    >
      <Icon name="logout" size={18} /> Really leave?
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setAsking(true)}
      aria-label="Leave the room"
      title="Leave the room"
      className="inline-flex size-11 items-center justify-center rounded-control border-2 border-line bg-surface text-ink"
    >
      <Icon name="logout" />
    </button>
  );
}
