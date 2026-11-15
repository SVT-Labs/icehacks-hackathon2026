"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId } from "react";
import { LIMITS } from "@/lib/constants";
import type { Avatar } from "@/lib/types";
import { Penguin, type PenguinMood } from "./Penguin";

const FLOE_TOP =
  "M14 18 Q20 6 44 6 L112 4 Q142 4 150 16 Q156 26 142 32 L118 38 Q80 44 40 38 L20 34 Q6 28 14 18 Z";

const CRACKS = [
  "M72 6 L67 14 L76 21 L69 30 L74 40",
  "M108 5 L112 14 L103 20 L110 29 L105 36",
  "M38 8 L45 16 L36 24 L43 35",
];

export function PenguinOnIce({
  avatar,
  cracks = 0,
  broken = false,
  mood,
  size = 96,
}: {
  avatar: Avatar;
  cracks?: number;
  broken?: boolean;
  mood?: PenguinMood;
  size?: number;
}) {
  // Each floe needs its own clip-path ids: several are on screen at once.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const shown = Math.min(cracks, CRACKS.length);
  const autoMood: PenguinMood =
    mood ?? (cracks >= LIMITS.CRACKS_TO_SPLASH - 1 ? "nervous" : "idle");

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size * 1.02 }}
      aria-hidden="true"
    >
      <AnimatePresence>
        {broken ? (
          <motion.svg
            key="rings"
            viewBox="0 0 160 56"
            className="absolute bottom-0 left-0 w-full overflow-visible"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {[0, 1, 2].map((i) => (
              <motion.ellipse
                key={i}
                cx="80"
                cy="28"
                fill="none"
                stroke="var(--foam)"
                strokeWidth="2.5"
                initial={{ rx: 8, ry: 3, opacity: 0.9 }}
                animate={{ rx: 70, ry: 20, opacity: 0 }}
                transition={{ duration: 1.3, delay: 0.25 + i * 0.22, ease: "easeOut" }}
              />
            ))}
            {[-34, -14, 10, 30].map((dx, i) => (
              <motion.circle
                key={dx}
                cx={80 + dx * 0.4}
                cy="24"
                r="3.2"
                fill="var(--foam)"
                initial={{ opacity: 0 }}
                animate={{
                  cx: 80 + dx,
                  cy: [24, -6 - i * 4, 30],
                  opacity: [0, 1, 0],
                }}
                transition={{ duration: 0.8, delay: 0.28 + i * 0.04, ease: "easeOut" }}
              />
            ))}
          </motion.svg>
        ) : null}
      </AnimatePresence>

      <svg
        viewBox="0 0 160 56"
        className="absolute bottom-0 left-0 w-full overflow-visible"
      >
        <defs>
          <clipPath id={`${uid}-left`}>
            <path d="M0 -10 H76 L70 12 L82 26 L74 60 H0 Z" />
          </clipPath>
          <clipPath id={`${uid}-right`}>
            <path d="M76 -10 H170 V60 H74 L82 26 L70 12 Z" />
          </clipPath>
        </defs>
        {(["left", "right"] as const).map((half) => (
          <motion.g
            key={half}
            clipPath={`url(#${uid}-${half})`}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
            initial={false}
            animate={
              broken
                ? {
                    rotate: half === "left" ? -16 : 16,
                    x: half === "left" ? -12 : 12,
                    y: 26,
                    opacity: 0,
                  }
                : { rotate: 0, x: 0, y: 0, opacity: 1 }
            }
            transition={
              broken
                ? { duration: 0.9, ease: "easeIn" }
                : { type: "spring", stiffness: 180, damping: 18 }
            }
          >
            <path d={FLOE_TOP} transform="translate(0 9)" fill="var(--ice-edge)" />
            <path
              d={FLOE_TOP}
              fill="var(--ice)"
              stroke="var(--ice-edge)"
              strokeWidth="1.5"
            />
            {CRACKS.slice(0, shown).map((d) => (
              <motion.path
                key={d}
                d={d}
                fill="none"
                stroke="var(--ice-crack)"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              />
            ))}
          </motion.g>
        ))}
      </svg>

      <motion.div
        className="absolute left-1/2"
        style={{ width: size * 0.6, marginLeft: -(size * 0.3), top: size * 0.13 }}
        initial={false}
        animate={
          broken
            ? { y: size * 0.75, opacity: 0, rotate: -14 }
            : { y: 0, opacity: 1, rotate: 0 }
        }
        transition={
          broken
            ? { duration: 0.55, delay: 0.18, ease: "easeIn" }
            : { type: "spring", stiffness: 200, damping: 15 }
        }
      >
        <div className={broken ? undefined : "animate-bob"}>
          <Penguin avatar={avatar} mood={broken ? "nervous" : autoMood} />
        </div>
      </motion.div>
    </div>
  );
}
