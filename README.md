# Thin Ice

**Two truths, one lie. Don't fall in.**

Thin Ice is a party game for friend groups, built for IceHacks 2026. Everyone writes two true things about themselves, an AI forges a third, and the rest of the group has to spot the fake. A wrong guess cracks the ice under your penguin. Every reveal ends with a story to ask about, so a quiet group chat has something to talk about.

> **Status:** the frontend, the game rules and their tests are complete and playable in demo mode. The server (API routes, database, AI call) is being built from [docs/BACKEND_PROMPT.md](docs/BACKEND_PROMPT.md). The live link and the demo video will be added here.

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

`npm test` runs the engine tests: scoring with exact numbers, every phase change, bots, late joiners, leaving, and a check that nothing public reveals the lie before its reveal.

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
tests/                Engine tests
docs/BACKEND_PROMPT.md  The brief the backend is built from
```

## Privacy and safety

- There are no accounts. A player is a nickname and a random id kept in the browser.
- A room can only be opened by someone who has its link, and pages are marked not to be indexed by search engines.
- Players are told, where they type, that everyone in the room will read what they write.
- Nicknames are not sent to the AI.

## Known limits

- In demo mode a room exists only in one browser, so friends on other devices cannot join it. Playing across devices needs the live backend.
- Dictation depends on the browser; where speech recognition is missing the microphone button is not shown and typing works as usual.
- Bots guess at random and their cards are fiction. They exist so one person can see the game.
- The eight-second reveal is short for slow readers; the host can pause it or raise it in the settings.

## Credits

- Built with Claude Code (Anthropic) as a coding assistant: Claude wrote most of the code under the team's direction, and the team reviewed, tested and directed the design.
- Libraries: Next.js, React, Tailwind CSS, Motion, Zod, Firebase, Vitest.
- Fonts: Fredoka and Nunito (SIL Open Font License), self-hosted through `next/font`.
- The penguin, ice and icon drawings are original SVG made for this project.

## Team

SVT Labs
