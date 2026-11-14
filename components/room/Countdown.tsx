"use client";

import { cx } from "@/components/ui";
import { clock } from "./shared";

const R = 20;
const LENGTH = 2 * Math.PI * R;

/** A ring that empties as the phase runs out, with the time left inside. */
export function Countdown({
  startedAt,
  endsAt,
  now,
  label,
  paused = false,
}: {
  startedAt: number | null;
  endsAt: number | null;
  now: number;
  label: string;
  paused?: boolean;
}) {
  if (endsAt === null) {
    return paused ? (
      <span className="rounded-md bg-gold-bg px-2 py-1 font-display font-semibold text-gold">
        Paused
      </span>
    ) : null;
  }
  const left = Math.max(0, endsAt - now);
  const total = Math.max(1, endsAt - (startedAt ?? endsAt - left));
  const fraction = Math.min(1, left / total);
  const seconds = Math.ceil(left / 1000);
  const urgent = seconds <= 5;

  return (
    <div
      role="timer"
      aria-label={`${label}: ${seconds} seconds left`}
      className={cx(
        "relative flex size-14 shrink-0 items-center justify-center",
        urgent ? "text-bad" : "text-primary",
      )}
    >
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="24" cy="24" r={R} fill="none" stroke="var(--line)" strokeWidth="5" />
        <circle
          cx="24"
          cy="24"
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={LENGTH}
          strokeDashoffset={LENGTH * (1 - fraction)}
          style={{ transition: "stroke-dashoffset 220ms linear" }}
        />
      </svg>
      <span className="tabular font-display text-sm font-bold text-ink" aria-hidden="true">
        {clock(left)}
      </span>
    </div>
  );
}
