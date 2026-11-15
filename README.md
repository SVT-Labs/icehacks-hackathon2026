# Thin Ice

**Two truths, one lie. Don't fall in.**

Thin Ice is a party game for friend groups, built for IceHacks 2026. Everyone writes two true things about themselves, an AI forges a third, and the rest of the group has to spot the fake. A wrong guess cracks the ice under your penguin. Every reveal ends with a story to ask about, so a quiet group chat has something to talk about.

> **Live site:** to be added. **Demo video:** to be added.

## How a game goes

1. **Lobby.** A host creates a lobby and shares one link. Players pick a nickname and a penguin. The host can change the rules. Someone playing alone gets penguin bots, so one person can try a whole game.
2. **Write.** Everyone writes two true statements at the same time, by typing or by speaking. The AI offers three to five lies in the same style, and each player picks one or writes their own.
3. **Guess.** Cards are shown one at a time. Everyone except the author picks the statement they think is the lie, against a timer.
4. **Reveal.** The lie is shown with who fell for it, the points, and a conversation starter built from one of the truths. The host can pause here for the story.
5. **Round end.** Scores, and any penguin whose ice cracked three times falls in. Everyone is back for the next round.
6. **Game over.** A podium, two awards (best liar and sharpest eye) and a list of every true thing the group learned about each other.

### Scoring

Every number is a host setting; these are the defaults.

| Event | Points | Ice |
| --- | --- | --- |
| You spot the lie | +100, plus up to +50 for speed | |
| You guess wrong, or do not guess | −50 | one crack |
| Your lie fools a player | +50 each, ×1.5 if the AI wrote it | |
| 60% or more of the players spot your lie | −50 | one crack |

Scores never go below zero. The game ends after a round in which someone has reached the winning score (1000), or after the last round (3).

## How it is built

| Part | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling and motion | Tailwind CSS 4, Motion, inline SVG for the penguins and ice |
| Contract | Zod schemas in `lib/types.ts`, shared by browser, engine and API |
| Game rules | A pure engine in `lib/game`, with no I/O, time or randomness of its own |
| Live updates | Firebase Realtime Database, read-only for browsers |
| Server | Next.js route handlers; they are the only writer to the database |
| AI | Claude (Anthropic API), one call per card |
| Hosting | Netlify |
| Sound | Synthesised in the browser with the Web Audio API; there are no audio files |
| Dictation | The browser's speech recognition, where it exists |

The rules live in one place. `lib/game/engine.ts` takes a room, an action, the current time and a random source, and returns the next room. The server runs it inside a database transaction; demo mode runs the very same code inside the browser. That is why the game can be played with no backend at all, and why the two can never disagree about the rules.

A room has a public half and a private half. Which statement is the lie stays in the private half until the reveal, and browsers can only read the public half.

There is no long-running server. A phase carries the time it ends; when a countdown reaches zero each browser asks the server to move on, and the server acts on the first request and ignores the rest.

## Run it locally

Needs Node.js 24.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. With no environment variables the app runs in **demo mode**: the whole game runs in your browser, rooms are kept in `localStorage`, and the lies come from a fixed list instead of the AI.

To play several players in one browser in demo mode, open the room link in another tab with `?seat=2` (then `?seat=3`, and so on) added to the address. Each seat is a separate player.

To test the "AI is unavailable" path in demo mode, run `localStorage.setItem("thinice:demo:ai", "off")` in the browser console.

## Checks

```bash
npm test
```

```bash
npm run lint
```

```bash
npm run build
```

`npm test` runs 83 tests: the rules engine (scoring with exact numbers, every phase change, bots, late joiners, leaving), the API routes played end to end, the checks on the AI's answers, and a test that nothing public reveals the lie before its reveal.

With the dev server running, two more scripts exercise the real thing over HTTP. Both also work against the deployed site with `BASE_URL=https://...`.

```bash
npm run smoke
```

```bash
npm run security
```

`npm run smoke` plays a whole solo game. `npm run security` plays a hostile visitor and makes 54 checks: it tries to read the private half of a room and to write to the database with no login, uses wrong, missing and borrowed tokens, calls host actions as a guest, sends malformed input, tries to peek at other players' cards, and replays stale and repeated guesses.

## Settings

Copy `.env.example` to `.env.local`. Setting `NEXT_PUBLIC_FIREBASE_DATABASE_URL` switches the browser from demo mode to the live backend.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_DATABASE_URL`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Browser | Read-only live updates |
| `NEXT_PUBLIC_MOCK` | Browser | `1` forces demo mode |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_DATABASE_URL` | Server | Service account that writes rooms |
| `ANTHROPIC_API_KEY`, `LLM_MODEL` | Server | The AI that writes lies (default model `claude-sonnet-5-5`) |
| `DEMO_MODE` | Server | `true` answers with canned lies and never calls the AI |
| `LLM_DAILY_CAP` | Server | Most AI calls per day; beyond it players write their own lies |

## Where things are

```
app/                  Pages: home, room (/r/CODE), not-found
components/           Penguin, ice, sea, buttons and the home form
components/room/      One file per phase: Lobby, Writing, Guessing, Reveal, RoundEnd, GameOver
lib/types.ts          The contract (Zod): public room, settings, API bodies
lib/constants.ts      Limits and setting ranges
lib/game/             The rules engine, the private room state and the bot characters
lib/client/           Drivers (live and demo), identity, sound, dictation
app/api/rooms/        The API routes
lib/server/           Storage, the AI call, moderation and HTTP helpers
tests/                Engine and server tests
scripts/              smoke.mjs (plays a game over HTTP) and security.mjs (misuse checks)
database.rules.json   Who may read what in the database
docs/BACKEND_PROMPT.md  The brief the backend was built from
```

## Privacy and safety

- There are no accounts. A player is a nickname and a random id kept in the browser.
- A room can only be opened by someone who has its link, and pages are marked not to be indexed by search engines.
- Players are told, where they type, that everyone in the room will read what they write.
- Nicknames are not sent to the AI.
- Which statement is the lie is stored where browsers cannot read it, and only the server writes to the database. `database.rules.json` allows one thing: reading the public half of a room you know the code of.
- Every action is checked on the server against a secret token given to that player when they joined. The host's actions are refused for anyone else.
- What players type is shown as plain text, never as HTML, and is checked before it is stored: links, e-mail addresses, phone numbers and a block list are refused, and the AI refuses truths that bully someone or contain private details.
- The API keys and the database's private key exist only on the server. A check of the production build found none of them in the code sent to browsers.
- Pages are served with headers that stop them being framed by another site and stop room links leaking to other sites.

## Backend

The API lives in `app/api/rooms/**` and stores rooms in Firebase Realtime Database. With no Firebase server variables set it uses an in-memory store instead, so `npm run dev` and `npm test` work without an account.

### Set up Firebase

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. **Build → Realtime Database → Create database.** Pick a region and start in locked mode.
3. In the database's **Rules** tab, paste the contents of `database.rules.json` and publish. Browsers may then read `rooms/{code}/public` only; everything else is server-only.
4. **Project settings → Service accounts → Generate new private key.** This downloads a JSON file. Do not commit it.
5. **Project settings → General → Your apps → Add app → Web** to get the web configuration.

### Environment variables

Put these in `.env.local` for local runs and in Netlify's site settings for the deployed site.

| Variable | Where the value comes from |
|---|---|
| `FIREBASE_PROJECT_ID` | `project_id` in the service-account JSON |
| `FIREBASE_CLIENT_EMAIL` | `client_email` in the service-account JSON |
| `FIREBASE_PRIVATE_KEY` | `private_key` in the service-account JSON, kept in quotes with its line breaks written as `\n` |
| `FIREBASE_DATABASE_URL` | The URL at the top of the Realtime Database page, such as `https://<project>-default-rtdb.<region>.firebasedatabase.app` |
| `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | The same database URL (`databaseURL` in the web configuration). Setting it switches the browser from demo mode to the backend. |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `apiKey` in the web configuration |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `projectId` in the web configuration |
| `ANTHROPIC_API_KEY` | An API key from [platform.claude.com](https://platform.claude.com). Without it players write their own lies. |
| `LLM_MODEL` | Optional; defaults to `claude-sonnet-5-5` |
| `DEMO_MODE` | `true` returns canned lies and never calls the AI |
| `LLM_DAILY_CAP` | Optional; most AI calls per UTC day, default 1500 |

The three service-account fields are stored separately rather than as the whole JSON file because Netlify functions have a small limit on total environment size.

### Check it

```bash
npm test
```

```bash
npm run dev
```

With the dev server running, in a second terminal (`BASE_URL` defaults to `http://localhost:3000`):

```bash
npm run smoke
```

The smoke script plays a solo game over HTTP and exits non-zero on any failure. Point `BASE_URL` at a deployed site to check it.

## Known limits

- In demo mode a room exists only in one browser, so friends on other devices cannot join it. Playing across devices needs the live backend.
- Dictation depends on the browser; where speech recognition is missing the microphone button is not shown and typing works as usual.
- Bots guess at random and their cards are fiction. They exist so one person can see the game.
- The eight-second reveal is short for slow readers; the host can pause it or raise it in the settings.

## Credits

- Built with Claude Code (Anthropic) as a coding assistant: Claude wrote most of the code under the team's direction, and the team reviewed, tested and directed the design.
- Libraries: Next.js, React, Tailwind CSS, Motion, Zod, Firebase (`@firebase/app`, `@firebase/database`, `firebase-admin`), the Anthropic SDK, Vitest.
- Fonts: Fredoka and Nunito (SIL Open Font License), self-hosted through `next/font`.
- The penguin, ice and icon drawings are original SVG made for this project.

## Team

SVT Labs
