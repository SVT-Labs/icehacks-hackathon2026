"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Penguin } from "@/components/Penguin";
import { ProfileFields } from "@/components/ProfileFields";
import { Button, Notice, Panel } from "@/components/ui";
import { errorMessage, type GameApi } from "@/lib/client/api";
import { initialProfile, saveProfile, type Identity } from "@/lib/client/identity";
import { sfx } from "@/lib/client/sfx";
import type { Avatar, PublicRoom } from "@/lib/types";
import { humans } from "./shared";

/** Shown to someone who opened a room link but is not a player in it yet. */
export function JoinGate({
  api,
  code,
  room,
  onJoined,
}: {
  api: GameApi;
  code: string;
  room: PublicRoom;
  onJoined: (identity: Identity) => void;
}) {
  // This screen only appears once the room has loaded in the browser, so the
  // saved profile can be read straight away.
  const [seed] = useState(() => initialProfile(true));
  const [name, setName] = useState(seed.name);
  const [avatar, setAvatar] = useState<Avatar>(seed.avatar);
  const [nameError, setNameError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const people = humans(room);
  const host = room.players[room.hostId];
  const full = Object.keys(room.players).length >= room.settings.maxPlayers;
  const over = room.phase === "gameOver";

  async function join(event: FormEvent) {
    event.preventDefault();
    const nickname = name.trim();
    if (!nickname) {
      setNameError("Pick a nickname first.");
      document.getElementById("join-name")?.focus();
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const joined = await api.joinRoom(code, { nickname, avatar });
      saveProfile({ name: nickname, avatar });
      sfx.pop();
      onJoined(joined);
    } catch (error) {
      setFailure(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-16 pt-8 sm:px-6">
      <h1 className="text-4xl font-bold">
        {host ? `${host.name}’s lobby` : "Join the lobby"}
      </h1>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2" aria-label="Players already here">
        {people.map((player) => (
          <li key={player.id} className="flex items-center gap-1.5 font-semibold">
            <Penguin avatar={player.avatar} className="h-9 w-8" />
            {player.name}
          </li>
        ))}
      </ul>

      {over ? (
        <Panel className="mt-6 space-y-4">
          <p>
            This game has finished. Ask {host?.name ?? "the host"} to press &ldquo;Play
            again&rdquo;, then open the link once more.
          </p>
          <Link href="/" className="font-bold text-primary underline underline-offset-2">
            Start your own lobby
          </Link>
        </Panel>
      ) : full ? (
        <Panel className="mt-6 space-y-4">
          <p>
            This lobby is full ({room.settings.maxPlayers} players). The host can raise
            the limit in the settings before the game starts.
          </p>
          <Link href="/" className="font-bold text-primary underline underline-offset-2">
            Start your own lobby
          </Link>
        </Panel>
      ) : (
        <Panel className="mt-6">
          <form onSubmit={join} className="space-y-5" noValidate>
            {room.phase !== "lobby" ? (
              <Notice tone="info">
                A game is already running. You can jump in: you guess from the next
                card and write your own truths from the next round.
              </Notice>
            ) : null}
            <ProfileFields
              idPrefix="join"
              name={name}
              avatar={avatar}
              error={nameError}
              onName={(value) => {
                setName(value);
                if (nameError) setNameError(null);
              }}
              onAvatar={setAvatar}
            />
            {failure ? <Notice>{failure}</Notice> : null}
            <Button type="submit" variant="accent" size="lg" busy={busy} className="w-full">
              Join the lobby
            </Button>
          </form>
        </Panel>
      )}
    </main>
  );
}
