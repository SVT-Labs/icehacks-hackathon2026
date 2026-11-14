import { describe, expect, it } from "vitest";
import type { Database } from "firebase-admin/database";
import { firebaseDriver } from "@/lib/server/store";

/**
 * A stand-in for one Realtime Database path that follows the SDK's rules: the
 * first call sees the local cache; returning undefined aborts at once without
 * asking the server; any other value is compared with the server's, and a
 * mismatch reruns the update on the server's value.
 */
function fakeDb(server: unknown, cache: unknown) {
  const state = { server, calls: [] as unknown[] };
  const db = {
    ref: () => ({
      async transaction(update: (value: unknown) => unknown) {
        let input = cache;
        for (let i = 0; i < 25; i++) {
          state.calls.push(input);
          const out = update(structuredClone(input));
          if (out === undefined) return { committed: false, snapshot: { val: () => state.server } };
          if (JSON.stringify(input) === JSON.stringify(state.server)) {
            state.server = out;
            return { committed: true, snapshot: { val: () => out } };
          }
          input = state.server;
        }
        throw new Error("too many retries");
      },
    }),
  };
  return { db: db as unknown as Database, state };
}

describe("firebase driver transactions", () => {
  it("decides on server data when the local cache is stale", async () => {
    // The room moved on to seq 2 on the server; this instance still caches seq 1.
    const { db, state } = fakeDb({ seq: 2 }, { seq: 1 });
    const result = await firebaseDriver(db).transact("ABCDE", (raw) => {
      const room = raw as { seq: number };
      // "Nothing to do" on the stale copy, a real change on the fresh one.
      return room.seq === 2 ? ({ seq: 3 } as never) : undefined;
    });
    expect(result).not.toBeNull();
    expect(state.server).toEqual({ seq: 3 });
    expect(state.calls).toEqual([{ seq: 1 }, { seq: 2 }]);
  });

  it("writes nothing new when there is nothing to do on fresh data", async () => {
    const { db, state } = fakeDb({ seq: 2 }, { seq: 2 });
    await firebaseDriver(db).transact("ABCDE", () => undefined);
    expect(state.server).toEqual({ seq: 2 });
  });

  it("reports a missing room as null", async () => {
    const { db } = fakeDb(null, null);
    expect(await firebaseDriver(db).transact("ABCDE", () => undefined)).toBeNull();
  });
});
