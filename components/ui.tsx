"use client";

import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import { Icon, type IconName } from "./Icon";

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// ---------- Button ----------

type Variant = "primary" | "accent" | "quiet" | "danger";

const VARIANT: Record<Variant, { cls: string; lip: string }> = {
  primary: { cls: "bg-primary text-primary-ink", lip: "var(--primary-lip)" },
  accent: { cls: "bg-accent text-accent-ink", lip: "var(--accent-lip)" },
  quiet: {
    cls: "bg-surface text-ink border-2 border-line",
    lip: "var(--line)",
  },
  danger: { cls: "bg-bad-bg text-bad border-2 border-bad/40", lip: "var(--bad)" },
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  busy = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  /** Shows a spinner and blocks clicks while a request is running. */
  busy?: boolean;
}) {
  const v = VARIANT[variant];
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      style={{ "--lip": v.lip, ...rest.style } as CSSProperties}
      className={cx(
        "lip lip-press inline-flex select-none items-center justify-center gap-2 rounded-control font-display font-semibold",
        "disabled:cursor-not-allowed disabled:opacity-55",
        size === "sm" && "min-h-10 px-3.5 text-[0.95rem]",
        size === "md" && "min-h-12 px-5 text-base",
        size === "lg" && "min-h-14 px-7 text-lg",
        v.cls,
        className,
      )}
    >
      {busy ? <Spinner /> : icon ? <Icon name={icon} size={size === "sm" ? 18 : 20} /> : null}
      {children}
    </button>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className="animate-spin"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ---------- Panel ----------

export function Panel({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "form" | "article";
}) {
  return (
    <Tag
      className={cx(
        "lip rounded-card border-2 border-line bg-surface p-5 sm:p-6",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

// ---------- Text field ----------

export function TextField({
  label,
  hint,
  error,
  id,
  className,
  trailing,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string | null;
  id: string;
  trailing?: ReactNode;
}) {
  const describedBy =
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block font-display font-semibold">
        {label}
      </label>
      <div className="flex items-stretch gap-2">
        <input
          id={id}
          {...rest}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cx(
            "min-h-12 w-full min-w-0 rounded-control border-2 bg-surface px-3.5 text-base text-ink placeholder:text-ink-soft/70",
            error ? "border-bad" : "border-control",
          )}
        />
        {trailing}
      </div>
      {hint && !error ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-ink-soft">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm font-semibold text-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ---------- Small pieces ----------

export function Tag({
  tone = "neutral",
  icon,
  children,
}: {
  tone?: "neutral" | "ai" | "good" | "bad" | "gold";
  icon?: IconName;
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-surface-2 text-ink-soft",
    ai: "bg-ai-bg text-ai",
    good: "bg-good-bg text-good",
    bad: "bg-bad-bg text-bad",
    gold: "bg-gold-bg text-gold",
  } as const;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-bold",
        tones[tone],
      )}
    >
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </span>
  );
}

export function Notice({
  tone = "bad",
  children,
}: {
  tone?: "bad" | "info";
  children: ReactNode;
}) {
  return (
    <p
      role={tone === "bad" ? "alert" : "status"}
      className={cx(
        "rounded-control border-2 px-3.5 py-2.5 text-[0.95rem] font-semibold",
        tone === "bad"
          ? "border-bad/40 bg-bad-bg text-bad"
          : "border-line bg-surface-2 text-ink",
      )}
    >
      {children}
    </p>
  );
}

export { cx };
