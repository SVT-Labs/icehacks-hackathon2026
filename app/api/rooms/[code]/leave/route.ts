import { leaveRoom } from "@/lib/game";
import { playerAction } from "@/lib/server/actions";
import { handle, json, roomCode, tokenOf } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = await roomCode(params);
    const token = tokenOf(request);
    await playerAction(code, token, (s, playerId) =>
      leaveRoom(s, { playerId, now: Date.now(), rng: Math.random }),
    );
    return json({ ok: true });
  });
}
