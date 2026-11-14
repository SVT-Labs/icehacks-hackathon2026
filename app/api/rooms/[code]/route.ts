import { handle, json, roomCode } from "@/lib/server/http";
import { readRoom } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The public half only: the same data every browser may read from Firebase.
// It lets scripts/smoke.mjs follow a game with no database SDK, including
// against the memory store.
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const room = await readRoom(await roomCode(params));
    return json(room.state.pub);
  });
}
