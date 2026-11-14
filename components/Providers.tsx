"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/**
 * App-wide client providers. `reducedMotion="user"` makes every Motion
 * animation drop its movement for people who ask their system for less motion.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
