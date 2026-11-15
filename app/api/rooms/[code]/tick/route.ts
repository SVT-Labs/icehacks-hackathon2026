import { tick } from "@/lib/game";
import { TickBodySchema } from "@/lib/types";
import { playerAction } from "@/lib/server/actions";
import { handle, json, playerFor, readBody, roomCode, tokenOf } from "@/lib/server/http";
import { readRoom } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = await roomCode(params);
    const token = tokenOf(request);
    const { seq } = await readBody(request, TickBodySchema);
    const room = await readRoom(code);
    playerFor(room, token);
    const probe = tick(room.state, { seq, now: Date.now(), rng: Math.random });
    if (probe !== room.state) {
      await playerAction(code, token, (s) => tick(s, { seq, now: Date.now(), rng: Math.random }));
    }
    return json({ ok: true });
  });
}
