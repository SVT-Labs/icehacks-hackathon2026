"use client";

import { AVATARS, LIMITS } from "@/lib/constants";
import { AVATAR_COLORS } from "@/lib/client/avatars";
import type { Avatar } from "@/lib/types";
import { Penguin } from "./Penguin";
import { TextField, cx } from "./ui";

/** Nickname and penguin colour, shared by the home page and the join screen. */
export function ProfileFields({
  idPrefix,
  name,
  avatar,
  error,
  onName,
  onAvatar,
}: {
  idPrefix: string;
  name: string;
  avatar: Avatar;
  error?: string | null;
  onName: (value: string) => void;
  onAvatar: (value: Avatar) => void;
}) {
  return (
    <div className="space-y-4">
      <TextField
        id={`${idPrefix}-name`}
        label="Your nickname"
        value={name}
        onChange={(event) => onName(event.target.value)}
        maxLength={LIMITS.NAME_MAX}
        autoComplete="nickname"
        autoCapitalize="words"
        spellCheck={false}
        placeholder="What do your friends call you?"
        error={error}
        enterKeyHint="go"
      />
      <fieldset>
        <legend className="mb-1.5 font-display font-semibold">Your penguin</legend>
        <div className="flex flex-wrap gap-2">
          {AVATARS.map((option) => {
            const selected = option === avatar;
            return (
              <label
                key={option}
                className={cx(
                  "relative cursor-pointer rounded-control border-2 p-1.5",
                  "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--focus)",
                  selected ? "border-primary bg-surface-2" : "border-transparent",
                )}
              >
                <input
                  type="radio"
                  name={`${idPrefix}-avatar`}
                  value={option}
                  checked={selected}
                  onChange={() => onAvatar(option)}
                  className="sr-only"
                />
                <Penguin avatar={option} className="h-12 w-11" />
                <span className="sr-only">{AVATAR_COLORS[option].label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
