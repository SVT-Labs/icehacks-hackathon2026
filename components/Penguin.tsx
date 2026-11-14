"use client";

import { motion } from "motion/react";
import { AVATAR_COLORS } from "@/lib/client/avatars";
import type { Avatar } from "@/lib/types";

export type PenguinMood = "idle" | "happy" | "nervous" | "sad";

const INK = "#0b2545";
const BEAK = "#ff8a3d";
const BEAK_SHADE = "#d9661b";

/**
 * The mascot. Drawn as inline SVG so it needs no image files, scales to any
 * size and can change expression. It is decorative: the player's name is
 * always written next to it, so the SVG is hidden from screen readers.
 */
export function Penguin({
  avatar,
  mood = "idle",
  className,
}: {
  avatar: Avatar;
  mood?: PenguinMood;
  className?: string;
}) {
  const { body, shade } = AVATAR_COLORS[avatar];
  const wingAngle = mood === "happy" ? 62 : mood === "nervous" ? 14 : 6;

  return (
    <svg
      viewBox="0 0 100 112"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <g className={mood === "nervous" ? "animate-shiver" : undefined}>
        {/* feet */}
        <ellipse cx="37" cy="105" rx="12" ry="5.5" fill={BEAK} />
        <ellipse cx="63" cy="105" rx="12" ry="5.5" fill={BEAK} />

        {/* wings, hinged at the shoulder */}
        <motion.ellipse
          cx="15"
          cy="64"
          rx="8.5"
          ry="23"
          fill={shade}
          style={{ transformBox: "fill-box", transformOrigin: "70% 8%" }}
          animate={{ rotate: wingAngle }}
          transition={{ type: "spring", stiffness: 260, damping: 16 }}
        />
        <motion.ellipse
          cx="85"
          cy="64"
          rx="8.5"
          ry="23"
          fill={shade}
          style={{ transformBox: "fill-box", transformOrigin: "30% 8%" }}
          animate={{ rotate: -wingAngle }}
          transition={{ type: "spring", stiffness: 260, damping: 16 }}
        />

        {/* body and belly */}
        <path
          d="M50 6 C74 6 86 30 86 62 C86 90 72 104 50 104 C28 104 14 90 14 62 C14 30 26 6 50 6 Z"
          fill={body}
        />
        <path
          d="M50 40 C67 40 75 55 75 71 C75 90 64 100 50 100 C36 100 25 90 25 71 C25 55 33 40 50 40 Z"
          fill="#ffffff"
        />
        <circle cx="38" cy="35" r="13.5" fill="#ffffff" />
        <circle cx="62" cy="35" r="13.5" fill="#ffffff" />

        {/* cheeks */}
        <circle cx="29" cy="44" r="4" fill="#ff9aa8" opacity="0.55" />
        <circle cx="71" cy="44" r="4" fill="#ff9aa8" opacity="0.55" />

        <Eyes mood={mood} />

        {/* beak */}
        <path d="M42 43 Q50 38 58 43 Q50 55 42 43 Z" fill={BEAK} />
        {mood === "happy" || mood === "nervous" ? (
          <path d="M45 45.5 Q50 44 55 45.5 Q50 52 45 45.5 Z" fill={BEAK_SHADE} />
        ) : null}

        {mood === "nervous" ? (
          <path
            d="M82 16 Q87 25 82 28 Q77 25 82 16 Z"
            fill="#7cc4f0"
            stroke="#3b8fc7"
            strokeWidth="1"
          />
        ) : null}
      </g>
    </svg>
  );
}

function Eyes({ mood }: { mood: PenguinMood }) {
  if (mood === "happy") {
    return (
      <g fill="none" stroke={INK} strokeWidth="2.8" strokeLinecap="round">
        <path d="M33.5 36 Q38.5 30 43.5 36" />
        <path d="M56.5 36 Q61.5 30 66.5 36" />
      </g>
    );
  }
  if (mood === "sad") {
    return (
      <g fill="none" stroke={INK} strokeWidth="2.8" strokeLinecap="round">
        <path d="M33.5 33 Q38.5 38 43.5 33" />
        <path d="M56.5 33 Q61.5 38 66.5 33" />
      </g>
    );
  }
  if (mood === "nervous") {
    return (
      <g>
        <circle cx="38.5" cy="34" r="6" fill="#ffffff" stroke={INK} strokeWidth="1.6" />
        <circle cx="61.5" cy="34" r="6" fill="#ffffff" stroke={INK} strokeWidth="1.6" />
        <circle cx="38.5" cy="35" r="2.2" fill={INK} />
        <circle cx="61.5" cy="35" r="2.2" fill={INK} />
      </g>
    );
  }
  return (
    <g
      className="animate-blink"
      style={{ transformBox: "fill-box", transformOrigin: "center" }}
    >
      <circle cx="38.5" cy="34" r="4.6" fill={INK} />
      <circle cx="61.5" cy="34" r="4.6" fill={INK} />
      <circle cx="40" cy="32.4" r="1.5" fill="#ffffff" />
      <circle cx="63" cy="32.4" r="1.5" fill="#ffffff" />
    </g>
  );
}
