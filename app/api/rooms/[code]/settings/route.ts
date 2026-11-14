import { updateSettings } from "@/lib/game";
import { SettingsPatchSchema } from "@/lib/types";
import { playerAction } from "@/lib/server/actions";
import { handle, json, readBody, roomCode, tokenOf } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = await roomCode(params);
    const token = tokenOf(request);
    const patch = await readBody(request, SettingsPatchSchema);
    await playerAction(code, token, (s, playerId) => updateSettings(s, { playerId, patch }));
    return json({ ok: true });
  });
}
