import { createRoom as engineCreateRoom } from "@/lib/game";
import { CreateRoomBodySchema, type CreateRoomResponse } from "@/lib/types";
import {
  handle,
  json,
  limitByIp,
  newPlayerId,
  newRoomCode,
  newToken,
  readBody,
} from "@/lib/server/http";
import { moderateName } from "@/lib/server/moderation";
import { cleanupOldRooms, createRoom } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_ATTEMPTS = 8;

export async function POST(request: Request) {
  return handle(async () => {
    limitByIp(request);
    const body = await readBody(request, CreateRoomBodySchema);
    const name = moderateName(body.nickname);
    const playerId = newPlayerId();
    const token = newToken();

    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      const code = newRoomCode();
      const now = Date.now();
      const state = engineCreateRoom({ code, playerId, name, avatar: body.avatar, now });
      if (await createRoom(code, state, { [playerId]: token })) {
        // The site promises rooms are gone after a day. Never fail the request over it.
        try {
          await cleanupOldRooms(now);
        } catch (error) {
          console.error("[api] room clean-up failed", error instanceof Error ? error.message : error);
        }
        const response: CreateRoomResponse = { code, playerId, token };
        return json(response);
      }
    }
    throw new Error("No free room code after several attempts");
  });
}
