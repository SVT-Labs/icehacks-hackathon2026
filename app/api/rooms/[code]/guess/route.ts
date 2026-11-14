import { submitGuess } from "@/lib/game";
import { GuessBodySchema } from "@/lib/types";
import { playerAction } from "@/lib/server/actions";
import { handle, json, readBody, roomCode, tokenOf } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = await roomCode(params);
    const token = tokenOf(request);
    const body = await readBody(request, GuessBodySchema);
    await playerAction(code, token, (s, playerId) =>
      submitGuess(s, { playerId, seq: body.seq, choice: body.choice, now: Date.now(), rng: Math.random }),
    );
    return json({ ok: true });
  });
}
