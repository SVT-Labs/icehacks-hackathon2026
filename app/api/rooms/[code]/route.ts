import { handle, json, roomCode } from "@/lib/server/http";
import { readRoom } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const room = await readRoom(await roomCode(params));
    return json(room.state.pub);
  });
}
