"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False while rendering on the server and during hydration, true afterwards.
 * Components use it to read browser-only things (localStorage, the page
 * address, feature support) without the server and browser disagreeing.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
