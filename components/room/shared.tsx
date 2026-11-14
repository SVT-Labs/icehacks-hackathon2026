"use client";

import { useCallback, useState } from "react";
import { errorMessage, type GameApi } from "@/lib/client/api";
import type { MeResponse, Player, PublicRoom } from "@/lib/types";

/** What every phase screen receives. */
export type GameCtx = {
  api: GameApi;
  code: string;
  token: string;
  meId: string;
  isHost: boolean;
  room: PublicRoom;
  me: MeResponse | null;
  refreshMe: () => void;
  /** The server's clock, refreshed a few times a second. */
  now: number;
};

/** Runs one request at a time and keeps its error message for display. */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(null);
    }
  }, []);

  return { busy, error, setError, run };
}

export function playersInOrder(room: PublicRoom): Player[] {
  return Object.values(room.players).sort(
    (a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id),
  );
}

export function byScore(room: PublicRoom): Player[] {
  return Object.values(room.players).sort(
    (a, b) => b.score - a.score || a.joinedAt - b.joinedAt,
  );
}

export function humans(room: PublicRoom): Player[] {
  return playersInOrder(room).filter((p) => !p.isBot);
}

/** "+120" or "−50", with a real minus sign. */
export function signed(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}

export function clock(msLeft: number): string {
  const total = Math.max(0, Math.ceil(msLeft / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export const LETTERS = ["A", "B", "C"] as const;
