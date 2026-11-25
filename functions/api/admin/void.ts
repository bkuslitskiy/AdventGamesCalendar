import type { Handler } from '../../../server/types.ts';
import { fail, json, nowMs, readJson, requireAdmin } from '../../../server/http.ts';
import { appendEvent, existingIds, idsForDevice } from '../../../server/db.ts';
import { iso } from '../../../src/core/time.ts';

interface Body {
  ids?: number[];
  device?: string;
  since?: string;
  until?: string;
  reason?: string;
}

/** Hide events by id, or every identify/solve from one device (optionally within a time range). */
export const onRequestPost: Handler = async ({ request, env }) => {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  const body = await readJson<Body>(request);
  if (!body) return fail(400, 'invalid JSON');
  let ids: number[] = [];
  if (Array.isArray(body.ids)) ids = await existingIds(env.DB, body.ids.filter((x) => Number.isInteger(x)));
  else if (typeof body.device === 'string') ids = await idsForDevice(env.DB, body.device, body.since, body.until);
  else return fail(400, 'give ids or device');
  if (!ids.length) return fail(404, 'nothing matched');
  const now = iso(nowMs(env));
  const { id } = await appendEvent(env.DB, {
    tsServer: now,
    tsClient: now,
    device: 'admin',
    type: 'void',
    payload: { ids, reason: String(body.reason ?? '').slice(0, 500) },
  });
  return json({ ok: true, id, voided: ids });
};
