// Security checks against a running Thin Ice server and its database.
//
//   npm run dev         (in another terminal)
//   npm run security    (or: BASE_URL=https://your-site.netlify.app npm run security)
//
// It plays the part of a curious or hostile visitor:
//   1. Database: reads and writes sent straight to Firebase with no login.
//      Only a room's public half may be read; nothing may be written.
//   2. API: wrong, missing and borrowed tokens, guests using host actions,
//      malformed input, peeking at other players' cards, stale and repeated
//      guesses, a kicked player's token.
//
// The database part needs NEXT_PUBLIC_FIREBASE_DATABASE_URL, from the
// environment or from .env.local. Without it only the API part runs.
// Exits non-zero if any check fails.

import fs from "node:fs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const API = `${BASE}/api/rooms`;

function databaseUrl() {
  if (process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL) return process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  try {
    const line = fs
      .readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("NEXT_PUBLIC_FIREBASE_DATABASE_URL="));
    return line ? line.slice(line.indexOf("=") + 1).replace(/^"|"$/g, "") : "";
  } catch {
    return "";
  }
}

let passed = 0;
let failed = 0;

function expect(label, got, want) {
  const ok = Array.isArray(want) ? want.includes(got) : got === want;
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} -> ${got}${ok ? "" : ` (wanted ${want})`}`);
}

async function call(method, path, { token, body, raw } = {}) {
  const response = await fetch(API + path, {
    method,
    headers: {
      ...(body !== undefined || raw !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { "x-player-token": token } : {}),
    },
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // Left as null; the status is what the checks look at.
  }
  return { status: response.status, data, text, headers: response.headers };
}

const create = async (nickname) => (await call("POST", "", { body: { nickname, avatar: "teal" } })).data;

// ---------- Set-up: room A (host Ada, guest Ben) and room B (host Cy) ----------

const A = await create("Ada");
if (!A?.code) {
  console.error(`Could not create a room at ${BASE}. Is the server running?`);
  process.exit(1);
}
const ben = (await call("POST", `/${A.code}/join`, { body: { nickname: "Ben", avatar: "rose" } })).data;
const B = await create("Cy");
const code = A.code;

// ---------- 1. The database, with no login ----------

const db = databaseUrl().replace(/\/$/, "");
if (!db) {
  console.log("--- database checks skipped: no NEXT_PUBLIC_FIREBASE_DATABASE_URL");
} else {
  console.log("--- the database, as an anonymous visitor");
  const direct = async (method, path, body) => {
    const response = await fetch(`${db}/${path}`, {
      method,
      headers: body !== undefined ? { "content-type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, text: await response.text() };
  };
  const pub = await direct("GET", `rooms/${code}/public.json`);
  expect("read a room's public half", pub.status, 200);
  expect("public half holds a token", pub.text.includes(A.token) || pub.text.includes(ben.token), false);
  for (const [label, path] of [
    ["read a room's private half", `rooms/${code}/private.json`],
    ["read a room's tokens", `rooms/${code}/tokens.json`],
    ["read a whole room", `rooms/${code}.json`],
    ["list every room", "rooms.json"],
    ["list room codes", "rooms.json?shallow=true"],
    ["read the database root", ".json"],
    ["read the room index", "index.json"],
    ["read the AI counters", "meta.json"],
  ]) {
    expect(label, (await direct("GET", path)).status, 401);
  }
  expect("add a player with a huge score", (await direct("PUT", `rooms/${code}/public/players/intruder.json`, { id: "intruder", score: 99999 })).status, 401);
  expect("change the phase", (await direct("PATCH", `rooms/${code}/public.json`, { phase: "gameOver" })).status, 401);
  expect("delete the room", (await direct("DELETE", `rooms/${code}.json`)).status, 401);
  expect("create a room directly", (await direct("PUT", "rooms/ZZZZZ.json", { public: { code: "ZZZZZ" } })).status, 401);
  expect("reset the AI counter", (await direct("PUT", "meta/llm/2000-01-01.json", 1)).status, 401);
}

// ---------- 2. The API ----------

console.log("--- who may call what");
expect("me without a token", (await call("GET", `/${code}/me`)).status, 403);
expect("me with a made-up token", (await call("GET", `/${code}/me`, { token: "not-a-real-token" })).status, 403);
expect("me with a token from another room", (await call("GET", `/${code}/me`, { token: B.token })).status, 403);
expect("guest changes the settings", (await call("PATCH", `/${code}/settings`, { token: ben.token, body: { targetScore: 300 } })).status, 403);
expect("guest starts the game", (await call("POST", `/${code}/start`, { token: ben.token })).status, 403);
expect("guest kicks the host", (await call("POST", `/${code}/host`, { token: ben.token, body: { action: "kick", targetId: A.playerId } })).status, 403);
expect("another room's host starts this game", (await call("POST", `/${code}/start`, { token: B.token })).status, 403);
expect("start without a token", (await call("POST", `/${code}/start`)).status, 403);

console.log("--- bad input");
expect("settings out of range", (await call("PATCH", `/${code}/settings`, { token: A.token, body: { targetScore: 99999999 } })).status, 400);
expect("settings with the wrong type", (await call("PATCH", `/${code}/settings`, { token: A.token, body: { speedBonus: "yes" } })).status, 400);
expect("body that is not JSON", (await call("POST", "", { raw: "{nope" })).status, 400);
expect("body over 8 KB", (await call("POST", "", { body: { nickname: "x".repeat(9000), avatar: "teal" } })).status, 400);
expect("nickname too long", (await call("POST", "", { body: { nickname: "x".repeat(40), avatar: "teal" } })).status, 400);
expect("avatar that does not exist", (await call("POST", "", { body: { nickname: "Dee", avatar: "dragon" } })).status, 400);
expect("nickname that is a link", (await call("POST", "", { body: { nickname: "www.spam.com", avatar: "teal" } })).status, 422);
expect("same nickname twice in a room", (await call("POST", `/${code}/join`, { body: { nickname: "ben", avatar: "teal" } })).status, 409);
expect("room that does not exist", (await call("GET", "/QQQQQ/me", { token: A.token })).status, 404);
expect("path tricks in the room code", (await call("POST", "/..%2F..%2Fmeta/join", { body: { nickname: "Eve", avatar: "teal" } })).status, [400, 404]);
expect("GET on the create route", (await call("GET", "")).status, 405);

console.log("--- during a game");
await call("POST", `/${code}/start`, { token: A.token });
const writing = await call("GET", `/${code}`);
expect("public room names the lie while writing", writing.text.includes("lieIndex"), false);
expect("public room holds a token", writing.text.includes(A.token) || writing.text.includes(ben.token), false);
expect("answers are not cached", writing.headers.get("cache-control"), "no-store");
await call("POST", `/${code}/card`, {
  token: A.token,
  body: {
    truths: ["I have never broken a single bone.", "I grew up next door to a bakery."],
    lie: { kind: "own", text: "I once sang on live national radio." },
  },
});
const guestView = await call("GET", `/${code}/me`, { token: ben.token });
expect("guest's private view shows the host's card", guestView.text.includes("bakery") || guestView.text.includes("radio"), false);
const early = await call("GET", `/${code}`);
expect("public room shows a locked card early", early.text.includes("bakery") || early.text.includes("radio"), false);
expect("guess before any card is shown", (await call("POST", `/${code}/guess`, { token: ben.token, body: { seq: 1, choice: 0 } })).status, 409);
await call("POST", `/${code}/card`, {
  token: ben.token,
  body: {
    truths: ["I collect old bus tickets from trips.", "I cannot whistle, however hard I try."],
    lie: { kind: "own", text: "I have run two full marathons." },
  },
});
let room = (await call("GET", `/${code}`)).data;
expect("phase once both cards are in", room.phase, "guessing");
expect("public room names the lie while guessing", JSON.stringify(room).includes("lieIndex"), false);
if (db) {
  const direct = await fetch(`${db}/rooms/${code}/public.json`);
  expect("database copy names the lie while guessing", (await direct.text()).includes("lieIndex"), false);
}
const authorToken = room.card.authorId === A.playerId ? A.token : ben.token;
const guesserToken = room.card.authorId === A.playerId ? ben.token : A.token;
expect("author guesses on their own card", (await call("POST", `/${code}/guess`, { token: authorToken, body: { seq: room.seq, choice: 0 } })).status, [400, 403]);
expect("guess with an old seq", (await call("POST", `/${code}/guess`, { token: guesserToken, body: { seq: room.seq - 1, choice: 0 } })).status, 409);
expect("guess with choice 7", (await call("POST", `/${code}/guess`, { token: guesserToken, body: { seq: room.seq, choice: 7 } })).status, 400);
expect("tick from another room's player", (await call("POST", `/${code}/tick`, { token: B.token, body: { seq: room.seq } })).status, 403);
expect("early tick is accepted", (await call("POST", `/${code}/tick`, { token: guesserToken, body: { seq: room.seq } })).status, 200);
expect("early tick ended the phase", (await call("GET", `/${code}`)).data.phase !== "guessing", false);
expect("first guess", (await call("POST", `/${code}/guess`, { token: guesserToken, body: { seq: room.seq, choice: 1 } })).status, 200);
room = (await call("GET", `/${code}`)).data;
expect("phase once the only guesser answered", room.phase, "reveal");
expect("second guess on the same card", (await call("POST", `/${code}/guess`, { token: guesserToken, body: { seq: room.seq, choice: 2 } })).status, [400, 409]);

console.log("--- after a kick");
const fay = (await call("POST", `/${B.code}/join`, { body: { nickname: "Fay", avatar: "mint" } })).data;
expect("host kicks a player", (await call("POST", `/${B.code}/host`, { token: B.token, body: { action: "kick", targetId: fay.playerId } })).status, 200);
expect("kicked player's token still works", (await call("GET", `/${B.code}/me`, { token: fay.token })).status === 200, false);

// Tidy up the test rooms' players.
await call("POST", `/${code}/leave`, { token: A.token });
await call("POST", `/${code}/leave`, { token: ben.token });
await call("POST", `/${B.code}/leave`, { token: B.token });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
