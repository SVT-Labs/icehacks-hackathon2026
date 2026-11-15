import type { RoomState } from "@/lib/game";
import { liveTokens, playerFor } from "./http";
import { NO_CHANGE, mutateRoom, type StoredRoom } from "./store";

export async function playerAction(
  code: string,
  token: string,
  fn: (state: RoomState, playerId: string) => RoomState,
): Promise<StoredRoom> {
  return mutateRoom(code, (room) => {
    const playerId = playerFor(room, token);
    const next = fn(room.state, playerId);
    if (next === room.state) return NO_CHANGE;
    return { state: next, tokens: liveTokens({ state: next, tokens: room.tokens }) };
  });
}
