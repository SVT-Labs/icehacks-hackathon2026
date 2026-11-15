"use client";

import { useSyncExternalStore } from "react";
import { isMuted, onMuteChange, setMuted, sfx } from "@/lib/client/sfx";
import { Icon } from "./Icon";

export function SoundToggle() {
  const muted = useSyncExternalStore(onMuteChange, isMuted, () => false);

  return (
    <button
      type="button"
      aria-pressed={!muted}
      aria-label={muted ? "Turn sound on" : "Turn sound off"}
      title={muted ? "Sound is off" : "Sound is on"}
      onClick={() => {
        setMuted(!muted);
        if (muted) sfx.pop();
      }}
      className="inline-flex size-11 items-center justify-center rounded-control border-2 border-line bg-surface text-ink"
    >
      <Icon name={muted ? "mute" : "volume"} />
    </button>
  );
}
