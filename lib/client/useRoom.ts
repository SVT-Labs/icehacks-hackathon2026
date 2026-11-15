"use client";

import { useCallback, useEffect, useState } from "react";
import type { MeResponse, PublicRoom } from "@/lib/types";
import { loadApi, type GameApi } from "./api";
import { clearIdentity, loadIdentity, saveIdentity, type Identity } from "./identity";

export type RoomStatus = "loading" | "ready" | "missing" | "error";

export function useRoom(code: string) {
  const [api, setApi] = useState<GameApi | null>(null);
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [status, setStatus] = useState<RoomStatus>("loading");
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

  const inRoom = Boolean(room && identity && room.players[identity.playerId]);

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

export function useServerNow(api: GameApi | null, active: boolean, everyMs = 200): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!api || !active) return;
    const timer = window.setInterval(() => setNow(api.now()), everyMs);
    return () => window.clearInterval(timer);
  }, [api, active, everyMs]);
  return now;
}
