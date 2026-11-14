import { meView } from "@/lib/game";
import { handle, json, playerFor, roomCode, tokenOf } from "@/lib/server/http";
import { readRoom } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = await roomCode(params);
    const token = tokenOf(request);
    const room = await readRoom(code);
    // meView only ever describes the calling player.
    return json(meView(room.state, playerFor(room, token)));
  });
}
