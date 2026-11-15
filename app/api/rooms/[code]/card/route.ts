import { submitCard } from "@/lib/game";
import { CardBodySchema, type LieChoice } from "@/lib/types";
import { playerAction } from "@/lib/server/actions";
import { handle, json, readBody, roomCode, tokenOf } from "@/lib/server/http";
import { moderateOwnLie, moderateTruths } from "@/lib/server/moderation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = await roomCode(params);
    const token = tokenOf(request);
    const body = await readBody(request, CardBodySchema);
    const truths = moderateTruths(body.truths);
    const lie: LieChoice =
      body.lie.kind === "own" ? { kind: "own", text: moderateOwnLie(body.lie.text, truths) } : body.lie;
    await playerAction(code, token, (s, playerId) =>
      submitCard(s, { playerId, truths, lie, now: Date.now(), rng: Math.random }),
    );
    return json({ ok: true });
  });
}
