"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Button, Notice, cx } from "@/components/ui";
import { errorMessage } from "@/lib/client/api";
import { SETTING_RANGES } from "@/lib/constants";
import { DEFAULT_SETTINGS, type Settings, type SettingsPatch } from "@/lib/types";
import type { GameCtx } from "./shared";

type NumberKey = {
  [K in keyof Settings]: Settings[K] extends number ? K : never;
}[keyof Settings];

/**
 * The host's settings. Changes show at once and are sent a moment later in
 * one request, so tapping a stepper ten times does not make ten requests.
 */
export function SettingsEditor({ ctx }: { ctx: GameCtx }) {
  const { api, code, token, room } = ctx;
  const [pending, setPending] = useState<SettingsPatch>({});
  const [error, setError] = useState<string | null>(null);
  const queued = useRef<SettingsPatch>({});
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const shown: Settings = { ...room.settings, ...pending };

  function change(patch: SettingsPatch) {
    setPending((current) => ({ ...current, ...patch }));
    queued.current = { ...queued.current, ...patch };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const send = queued.current;
      queued.current = {};
      try {
        await api.updateSettings(code, token, send);
        setError(null);
        // The room now holds these values (or the server adjusted them), so
        // stop overriding it once the update has had time to arrive.
        window.setTimeout(() => {
          setPending((current) => {
            const next: Record<string, unknown> = { ...current };
            for (const key of Object.keys(send) as (keyof Settings)[]) {
              if (next[key] === send[key]) delete next[key];
            }
            return next as SettingsPatch;
          });
        }, 1200);
      } catch (e) {
        setError(errorMessage(e));
        setPending({});
      }
    }, 250);
  }

  const num = (key: NumberKey, label: string, unit = "", hint?: string, max?: number) => (
    <Stepper
      label={label}
      hint={hint}
      unit={unit}
      value={shown[key]}
      min={SETTING_RANGES[key].min}
      max={max ?? SETTING_RANGES[key].max}
      step={SETTING_RANGES[key].step}
      onChange={(value) => change({ [key]: value })}
    />
  );

  return (
    <div className="space-y-4">
      {error ? <Notice>{error}</Notice> : null}
      <div className="divide-y-2 divide-line">
        {num("targetScore", "Winning score", "", "The game ends after a round in which someone reaches it.")}
        {num("maxRounds", "Rounds at most")}
        {num(
          "botCount",
          "Penguin bots",
          "",
          "If you start alone, a few join by themselves.",
          room.maxBots,
        )}
        {num("writeSeconds", "Time to write", " s")}
        {num("guessSeconds", "Time to guess", " s")}
      </div>

      <details className="group rounded-control border-2 border-line">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-3.5 font-display font-semibold">
          Points and more
          <Icon name="arrow" className="rotate-90 transition-transform group-open:-rotate-90" />
        </summary>
        <div className="divide-y-2 divide-line border-t-2 border-line px-3.5">
          {num("pointsCorrect", "Spotting the lie")}
          <Toggle
            label="Speed bonus"
            hint="Up to half as much again for a fast right guess."
            checked={shown.speedBonus}
            onChange={(value) => change({ speedBonus: value })}
          />
          {num("penaltyWrong", "Wrong guess costs")}
          {num("pointsPerFooled", "Each player you fool")}
          {num("aiLieBonusPct", "Bonus for an AI lie", "%", "Extra on what you earn for fooling people.")}
          {num("penaltyEasy", "A lie that is too easy costs")}
          {num("easyThresholdPct", "Too easy means spotted by", "%")}
          {num("lieOptions", "AI lies to choose from")}
          <Toggle
            label="Players may write their own lie"
            checked={shown.allowOwnLie}
            onChange={(value) => change({ allowOwnLie: value })}
          />
          {num("revealSeconds", "Time on each reveal", " s")}
          {num("maxPlayers", "Players at most", "", "Bots count as players.")}
        </div>
      </details>

      <Button variant="quiet" size="sm" icon="refresh" onClick={() => change({ ...DEFAULT_SETTINGS, botCount: shown.botCount })}>
        Back to the standard rules
      </Button>
    </div>
  );
}

function Stepper({
  label,
  hint,
  unit,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  hint?: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const button =
    "flex size-10 items-center justify-center rounded-control border-2 border-control bg-surface font-display text-xl font-bold disabled:opacity-40";
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="font-semibold">{label}</p>
        {hint ? <p className="text-sm text-ink-soft">{hint}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label={label}>
        <button
          type="button"
          className={button}
          aria-label={`Less: ${label}`}
          disabled={value <= min}
          onClick={() => onChange(clamp(value - step))}
        >
          −
        </button>
        <output className="tabular w-16 text-center font-display text-lg font-semibold" aria-live="polite">
          {value}
          {unit}
        </output>
        <button
          type="button"
          className={button}
          aria-label={`More: ${label}`}
          disabled={value >= max}
          onClick={() => onChange(clamp(value + step))}
        >
          +
        </button>
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="font-semibold">{label}</p>
        {hint ? <p className="text-sm text-ink-soft">{hint}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative h-8 w-14 shrink-0 rounded-full border-2 transition-colors",
          checked ? "border-primary bg-primary" : "border-control bg-surface-2",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 size-6 rounded-full transition-[left]",
            checked ? "left-[1.6rem] bg-primary-ink" : "left-0.5 bg-control",
          )}
        />
        <span className="sr-only">{checked ? "On" : "Off"}</span>
      </button>
    </div>
  );
}

/** What players who are not the host see instead of the editor. */
export function SettingsSummary({ settings }: { settings: Settings }) {
  const rows: [string, string][] = [
    ["Winning score", String(settings.targetScore)],
    ["Rounds at most", String(settings.maxRounds)],
    ["Time to write", `${settings.writeSeconds} s`],
    ["Time to guess", `${settings.guessSeconds} s`],
    ["Spotting the lie", `+${settings.pointsCorrect}`],
    ["Wrong guess", `−${settings.penaltyWrong}`],
    ["Each player you fool", `+${settings.pointsPerFooled}`],
    ["Bonus for an AI lie", `+${settings.aiLieBonusPct}%`],
    ["Write your own lie", settings.allowOwnLie ? "Allowed" : "Off"],
  ];
  return (
    <dl className="divide-y-2 divide-line">
      {rows.map(([term, value]) => (
        <div key={term} className="flex items-center justify-between gap-3 py-2">
          <dt className="text-ink-soft">{term}</dt>
          <dd className="tabular font-display font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
