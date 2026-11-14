import { joinRoom } from "@/lib/game";
import { JoinBodySchema, type JoinResponse } from "@/lib/types";
import { handle, json, limitByIp, newPlayerId, newToken, readBody, roomCode } from "@/lib/server/http";
import { moderateName } from "@/lib/server/moderation";
import { mutateRoom } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    limitByIp(request);
    const code = await roomCode(params);
    const body = await readBody(request, JoinBodySchema);
    const name = moderateName(body.nickname);
    const playerId = newPlayerId();
    const token = newToken();
    await mutateRoom(code, (room) => ({
      state: joinRoom(room.state, { playerId, name, avatar: body.avatar, now: Date.now() }),
      tokens: { ...room.tokens, [playerId]: token },
    }));
    const response: JoinResponse = { playerId, token };
    return json(response);
  });
}
