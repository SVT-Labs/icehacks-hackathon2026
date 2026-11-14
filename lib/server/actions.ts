// The step every authenticated write shares: read the room, find the player
// by token, run one engine function, write the result.

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
    // The engine returns the same object when there is nothing to do.
    if (next === room.state) return NO_CHANGE;
    // Players who left or were kicked lose their tokens with them.
    return { state: next, tokens: liveTokens({ state: next, tokens: room.tokens }) };
  });
}
