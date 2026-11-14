import { hostAction } from "@/lib/game";
import { HostActionSchema } from "@/lib/types";
import { playerAction } from "@/lib/server/actions";
import { handle, json, readBody, roomCode, tokenOf } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = await roomCode(params);
    const token = tokenOf(request);
    const action = await readBody(request, HostActionSchema);
    await playerAction(code, token, (s, playerId) =>
      hostAction(s, { playerId, action, now: Date.now(), rng: Math.random }),
    );
    return json({ ok: true });
  });
}
