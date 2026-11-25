import type { Handler } from '../../../server/types.ts';
import { fail, json, nowMs, readJson, requireAdmin } from '../../../server/http.ts';
import { appendEvent } from '../../../server/db.ts';
import { DAY_COUNT, iso } from '../../../src/core/time.ts';
import { isGameId, type GameId } from '../../../src/core/types.ts';

/** Clear babe's solves for a day (or one game of it). Undo by voiding the reset event. */
export const onRequestPost: Handler = async ({ request, env }) => {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  const body = await readJson<{ day?: number; game?: GameId | null; reason?: string }>(request);
  if (!body || !Number.isInteger(body.day) || body.day! < 1 || body.day! > DAY_COUNT) return fail(400, 'day must be 1–31');
  if (body.game != null && !isGameId(body.game)) return fail(400, 'unknown game');
  const now = iso(nowMs(env));
  const { id } = await appendEvent(env.DB, {
    tsServer: now,
    tsClient: now,
    device: 'admin',
    type: 'reset',
    day: body.day!,
    game: body.game ?? null,
    payload: { reason: String(body.reason ?? '').slice(0, 500) },
  });
  return json({ ok: true, id });
};
