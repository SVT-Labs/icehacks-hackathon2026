"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ProfileFields } from "@/components/ProfileFields";
import { Button, Notice, Panel, TextField } from "@/components/ui";
import { errorMessage, loadApi } from "@/lib/client/api";
import { initialProfile, saveIdentity, saveProfile } from "@/lib/client/identity";
import { sfx } from "@/lib/client/sfx";
import { useHydrated } from "@/lib/client/useHydrated";
import { LIMITS, ROOM_CODE_ALPHABET } from "@/lib/constants";
import type { Avatar } from "@/lib/types";

const cleanCode = (value: string) =>
  value
    .toUpperCase()
    .split("")
    .filter((ch) => ROOM_CODE_ALPHABET.includes(ch))
    .join("")
    .slice(0, LIMITS.ROOM_CODE_LENGTH);

function codeFromInput(value: string): string {
  const match = value.match(/\/r\/([A-Za-z0-9]+)/);
  return cleanCode(match ? match[1] : value);
}

export function StartPanel() {
  const hydrated = useHydrated();
  return <StartForm key={hydrated ? "browser" : "server"} hydrated={hydrated} />;
}

function StartForm({ hydrated }: { hydrated: boolean }) {
  const router = useRouter();
  const [seed] = useState(() => initialProfile(hydrated));
  const [name, setName] = useState(seed.name);
  const [avatar, setAvatar] = useState<Avatar>(seed.avatar);
  const [nameError, setNameError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  function checkName(): string | null {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Pick a nickname first.");
      document.getElementById("start-name")?.focus();
      return null;
    }
    setNameError(null);
    return trimmed;
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    const nickname = checkName();
    if (!nickname || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const api = await loadApi();
      const created = await api.createRoom({ nickname, avatar });
      saveProfile({ name: nickname, avatar });
      saveIdentity(created.code, { playerId: created.playerId, token: created.token });
      sfx.pop();
      router.push(`/r/${created.code}`);
    } catch (error) {
      setFailure(errorMessage(error));
      setBusy(false);
    }
  }

  function join(event: FormEvent) {
    event.preventDefault();
    const code = codeFromInput(joinCode);
    if (code.length !== LIMITS.ROOM_CODE_LENGTH) {
      setCodeError(`A room code has ${LIMITS.ROOM_CODE_LENGTH} letters or digits.`);
      return;
    }
    setCodeError(null);
    const nickname = name.trim();
    if (nickname) saveProfile({ name: nickname, avatar });
    router.push(`/r/${code}`);
  }

  return (
    <Panel className="space-y-5">
      <form onSubmit={create} className="space-y-5" noValidate>
        <ProfileFields
          idPrefix="start"
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
          Create a lobby
        </Button>
        <p className="text-sm text-ink-soft">
          Playing alone? Penguin bots fill the room, so you can try a whole game on
          your own.
        </p>
      </form>

      <form onSubmit={join} className="border-t-2 border-line pt-5" noValidate>
        <TextField
          id="join-code"
          label="Have a room code?"
          value={joinCode}
          onChange={(event) => {
            setJoinCode(codeFromInput(event.target.value));
            if (codeError) setCodeError(null);
          }}
          placeholder="K7QPM"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          error={codeError}
          className="[&_input]:font-display [&_input]:tracking-[0.2em] [&_input]:uppercase"
          trailing={
            <Button type="submit" variant="quiet" icon="arrow">
              Join
            </Button>
          }
        />
      </form>
    </Panel>
  );
}
