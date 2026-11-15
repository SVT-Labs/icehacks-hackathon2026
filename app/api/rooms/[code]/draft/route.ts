import { GameError, draftsLeft, meView, setDraft } from "@/lib/game";
import { DraftBodySchema, type DraftResponse } from "@/lib/types";
import { playerAction } from "@/lib/server/actions";
import { handle, json, playerFor, readBody, roomCode, tokenOf } from "@/lib/server/http";
import { draftLies } from "@/lib/server/llm";
import { UNSAFE_MESSAGE, moderateTruths } from "@/lib/server/moderation";
import { readRoom } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = await roomCode(params);
    const token = tokenOf(request);
    const body = await readBody(request, DraftBodySchema);
    const truths = moderateTruths(body.truths);

    const room = await readRoom(code);
    draftsLeft(room.state, playerFor(room, token));

    // The AI call stays outside the transaction: it is slow, and a transaction can
    // run more than once.
    const ai = await draftLies(truths, room.state.pub.settings.lieOptions);
    if (ai.verdict === "unsafe") throw new GameError("unsafe", UNSAFE_MESSAGE);

    // The AI never sees nicknames, so they are added to the starters here.
    let response: DraftResponse = { candidates: [], source: "unavailable", draftsLeft: 0 };
    await playerAction(code, token, (s, playerId) => {
      const name = s.pub.players[playerId]?.name ?? "them";
      const next = setDraft(s, {
        playerId,
        truths,
        candidates: ai.verdict === "ok" ? ai.lies : [],
        starters: ai.verdict === "ok" ? ai.starters.map((t) => t.replaceAll("{name}", name)) : [],
        source: ai.verdict === "ok" ? "ai" : "unavailable",
        now: Date.now(),
      });
      const draft = meView(next, playerId).draft;
      response = {
        candidates: draft?.candidates ?? [],
        source: draft?.source ?? "unavailable",
        draftsLeft: draft?.draftsLeft ?? 0,
      };
      return next;
    });
    return json(response);
  });
}
