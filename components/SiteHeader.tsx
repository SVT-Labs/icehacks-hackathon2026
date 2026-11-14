import Link from "next/link";
import type { ReactNode } from "react";
import { IS_LIVE } from "@/lib/client/api";
import { Penguin } from "./Penguin";
import { SoundToggle } from "./SoundToggle";

export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 pt-4 sm:px-6">
      <Link
        href="/"
        className="flex items-center gap-2 rounded-control font-display text-2xl font-bold text-ink"
      >
        <Penguin avatar="navy" className="h-9 w-8" />
        Thin Ice
      </Link>
      {IS_LIVE ? null : (
        <span
          className="rounded-md bg-gold-bg px-2 py-0.5 text-sm font-bold text-gold"
          title="The game is running inside this browser. Lies come from a fixed list, not from the AI."
        >
          Demo mode
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        {children}
        <SoundToggle />
      </div>
    </header>
  );
}
