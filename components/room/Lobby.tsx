"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Button, Notice, Panel } from "@/components/ui";
import { LIMITS } from "@/lib/constants";
import { sfx } from "@/lib/client/sfx";
import { useHydrated } from "@/lib/client/useHydrated";
import { SettingsEditor, SettingsSummary } from "./Settings";
import { humans, useAction, type GameCtx } from "./shared";

export function Lobby({ ctx }: { ctx: GameCtx }) {
  const { api, code, token, room, isHost } = ctx;
  const action = useAction();
  const [copied, setCopied] = useState(false);
  const hydrated = useHydrated();
  const link = hydrated ? `${window.location.origin}/r/${code}` : "";
  const canShare = hydrated && typeof navigator.share === "function";

  const people = humans(room);
  const host = room.players[room.hostId];
  const alone = people.length === 1;
  const soloBots = alone && room.settings.botCount < LIMITS.SOLO_BOT_MIN;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      sfx.pop();
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      action.setError("Could not copy. Select the link and copy it by hand.");
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: "Thin Ice",
        text: "Two truths and an AI lie. Join my lobby:",
        url: link,
      });
    } catch {
      // The share sheet was closed; nothing to report.
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.05fr]">
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold">
            {isHost ? "Your lobby is open" : `${host?.name ?? "The host"}’s lobby`}
          </h1>
          <p className="mt-2 text-lg text-ink-soft">
            {isHost
              ? "Send the link to your friends, then start when everyone is in."
              : "You are in. The game starts when the host is ready."}
          </p>
        </div>

        <Panel className="space-y-4">
          <div>
            <p className="font-display font-semibold">Room code</p>
            <p className="font-display text-5xl font-bold tracking-[0.18em] text-primary">
              {code}
            </p>
          </div>
          <div>
            <label htmlFor="invite-link" className="font-display font-semibold">
              Invite link
            </label>
            <input
              id="invite-link"
              readOnly
              value={link}
              onFocus={(event) => event.currentTarget.select()}
              className="mt-1.5 min-h-12 w-full rounded-control border-2 border-control bg-surface-2 px-3.5 text-ink"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button icon={copied ? "check" : "copy"} onClick={copy}>
              {copied ? "Copied" : "Copy link"}
            </Button>
            {canShare ? (
              <Button variant="quiet" icon="share" onClick={share}>
                Share
              </Button>
            ) : null}
          </div>
          <p className="sr-only" aria-live="polite">
            {copied ? "Invite link copied." : ""}
          </p>
        </Panel>

        {isHost ? (
          <div className="space-y-3">
            {soloBots ? (
              <Notice tone="info">
                Playing alone? Between {LIMITS.SOLO_BOT_MIN} and {room.maxBots} penguin
                bots will join when you start, so you can try a whole game.
              </Notice>
            ) : null}
            {action.error ? <Notice>{action.error}</Notice> : null}
            <Button
              variant="accent"
              size="lg"
              icon="play"
              busy={action.busy === "start"}
              onClick={() => action.run("start", () => api.start(code, token))}
              className="w-full sm:w-auto"
            >
              Start the game
            </Button>
            <p className="text-sm text-ink-soft">
              {people.length} {people.length === 1 ? "player" : "players"} in the lobby
              {room.settings.botCount > 0 ? `, plus ${room.settings.botCount} bots` : ""}.
            </p>
          </div>
        ) : (
          <p className="flex items-center gap-2 font-semibold text-ink-soft">
            <Icon name="clock" /> Waiting for {host?.name ?? "the host"} to start.
          </p>
        )}
      </div>

      <Panel as="section">
        <h2 className="mb-2 flex items-center gap-2 text-2xl font-semibold">
          <Icon name="settings" /> Rules for this lobby
        </h2>
        {isHost ? <SettingsEditor ctx={ctx} /> : <SettingsSummary settings={room.settings} />}
      </Panel>
    </div>
  );
}
