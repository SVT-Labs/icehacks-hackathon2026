"use client";

import { useCallback, useEffect, useState } from "react";
import type { MeResponse, PublicRoom } from "@/lib/types";
import { loadApi, type GameApi } from "./api";
import { clearIdentity, loadIdentity, saveIdentity, type Identity } from "./identity";

export type RoomStatus = "loading" | "ready" | "missing" | "error";

/**
 * Everything a room screen needs: the live public room, who this browser is,
 * what only this player may know (`me`), and the driver to send actions with.
 * The component using it must be keyed by the room code.
 */
export function useRoom(code: string) {
  const [api, setApi] = useState<GameApi | null>(null);
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [status, setStatus] = useState<RoomStatus>("loading");
  // Read once on the first browser render. The server renders the loading
  // screen whatever this is, so the two never disagree.
  const [identity, setIdentityState] = useState<Identity | null>(() =>
    typeof window === "undefined" ? null : loadIdentity(code),
  );
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meNonce, setMeNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    loadApi()
      .then((driver) => {
        if (cancelled) return;
        setApi(driver);
        unsubscribe = driver.subscribe(
          code,
          (next) => {
            setRoom(next);
            setStatus(next ? "ready" : "missing");
          },
          () => setStatus("error"),
        );
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [code]);

  const setIdentity = useCallback(
    (next: Identity | null) => {
      if (next) saveIdentity(code, next);
      else clearIdentity(code);
      setIdentityState(next);
    },
    [code],
  );

  // A saved identity only counts while the room still lists that player.
  // After a kick, or when an old code is reused, the join screen shows again.
  const inRoom = Boolean(room && identity && room.players[identity.playerId]);

  // Private state is fetched again on every phase change, after a refresh,
  // and whenever a screen asks for it.
  const seq = room?.seq;
  const token = identity?.token;
  useEffect(() => {
    if (!api || !token || !inRoom) return;
    let cancelled = false;
    api
      .me(code, token)
      .then((next) => {
        if (!cancelled) setMe(next);
      })
      .catch(() => {
        // The room screen shows connection problems; nothing to do here.
      });
    return () => {
      cancelled = true;
    };
  }, [api, code, token, inRoom, seq, meNonce]);

  const refreshMe = useCallback(() => setMeNonce((n) => n + 1), []);

  return {
    api,
    room,
    status,
    identity,
    setIdentity,
    me: inRoom ? me : null,
    refreshMe,
    inRoom,
  };
}

/** Re-renders on an interval and returns the server's current time. */
export function useServerNow(api: GameApi | null, active: boolean, everyMs = 200): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!api || !active) return;
    const timer = window.setInterval(() => setNow(api.now()), everyMs);
    return () => window.clearInterval(timer);
  }, [api, active, everyMs]);
  return now;
}
