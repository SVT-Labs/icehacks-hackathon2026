const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const DEADLINE = Date.now() + 120_000;

function fail(message) {
  console.error(`SMOKE FAILED: ${message}`);
  process.exit(1);
}

async function api(method, path, { token, body, ok = [200] } = {}) {
  const response = await fetch(`${BASE}/api/rooms${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { "x-player-token": token } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    fail(`${method} ${path} answered ${response.status} with non-JSON: ${text.slice(0, 200)}`);
  }
  if (response.headers.get("cache-control") !== "no-store") fail(`${method} ${path} is missing Cache-Control: no-store`);
  if (!ok.includes(response.status)) fail(`${method} ${path} answered ${response.status}: ${text.slice(0, 300)}`);
  return { status: response.status, data, text };
}

function checkLeak(room, text, where) {
  if (room.phase !== "reveal" && text.includes("lieIndex")) fail(`lieIndex visible in ${where} during ${room.phase}`);
}

const TRUTHS = ["I have climbed a volcano in Iceland.", "I keep a jar of buttons from my gran."];

const created = await api("POST", "", { body: { nickname: "Smoke", avatar: "navy" } });
const { code, playerId, token } = created.data;
console.log(`room ${code} on ${BASE}`);

await api("PATCH", `/${code}/settings`, { token, body: { maxRounds: 1, botCount: 2 } });
await api("POST", `/${code}/start`, { token });

let steps = 0;
let sawReveal = false;
let draftSource = null;
for (;;) {
  if (Date.now() > DEADLINE || ++steps > 300) fail("the game did not finish in time");
  const { data: room, text } = await api("GET", `/${code}`);
  checkLeak(room, text, "the public room");
  const me = await api("GET", `/${code}/me`, { token });
  if (me.data.playerId !== playerId) fail("GET /me answered for someone else");

  if (room.phase === "gameOver") break;
  if (room.phase === "reveal") sawReveal = true;

  if (room.phase === "writing" && !room.players[playerId]?.ready) {
    const draft = await api("POST", `/${code}/draft`, { token, body: { truths: TRUTHS } });
    draftSource = draft.data.source;
    const lie =
      draft.data.candidates.length > 0
        ? { kind: "ai", index: 0 }
        : { kind: "own", text: "I have a twin brother in Peru." };
    await api("POST", `/${code}/card`, { token, body: { truths: TRUTHS, lie } });
    continue;
  }

  const card = room.card;
  if (room.phase === "guessing" && card && card.authorId !== playerId && !(card.guessedIds ?? []).includes(playerId)) {
    await api("POST", `/${code}/guess`, { token, body: { seq: room.seq, choice: 1 } });
    continue;
  }

  await api("POST", `/${code}/tick`, { token, body: { seq: room.seq } });
  await api("POST", `/${code}/host`, { token, body: { action: "skip" }, ok: [200, 409] });
}

if (!sawReveal) fail("never saw a reveal");
const missing = await api("GET", `/${code}/me`, { ok: [403] });
if (missing.data.code !== "forbidden") fail("GET /me without a token was not forbidden");
await api("POST", `/${code}/leave`, { token });
console.log(`SMOKE OK: solo game finished in ${steps} steps (draft source: ${draftSource})`);
