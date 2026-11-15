import { AVATARS } from "@/lib/constants";
import type { Avatar } from "@/lib/types";

export type Identity = { playerId: string; token: string };
export type Profile = { name: string; avatar: Avatar };

// Testing aid: /r/CODE?seat=2 gives the tab its own identity, so one browser
// can hold several players.
function seat(): string {
  try {
    const value = new URLSearchParams(window.location.search).get("seat") ?? "";
    const clean = value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
    return clean ? `:${clean}` : "";
  } catch {
    return "";
  }
}

const idKey = (code: string) => `thinice:id:${code}${seat()}`;
const profileKey = () => `thinice:profile${seat()}`;

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function loadIdentity(code: string): Identity | null {
  const value = read<Identity>(idKey(code));
  return value && value.playerId && value.token ? value : null;
}

export function saveIdentity(code: string, identity: Identity) {
  write(idKey(code), identity);
}

export function clearIdentity(code: string) {
  try {
    window.localStorage.removeItem(idKey(code));
  } catch {}
}

export function loadProfile(): Profile | null {
  const value = read<Profile>(profileKey());
  if (!value || typeof value.name !== "string") return null;
  return AVATARS.includes(value.avatar) ? value : { ...value, avatar: "navy" };
}

export function saveProfile(profile: Profile) {
  write(profileKey(), profile);
}

export function initialProfile(hydrated: boolean): Profile {
  if (!hydrated) return { name: "", avatar: "navy" };
  return loadProfile() ?? { name: "", avatar: randomAvatar() };
}

export function randomAvatar(): Avatar {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)];
}
