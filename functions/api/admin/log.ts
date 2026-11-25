import type { Handler } from '../../../server/types.ts';
import { json, requireAdmin } from '../../../server/http.ts';
import { queryEvents } from '../../../server/db.ts';

/** Raw events, newest first. ?day=&type=&device=&limit= */
export const onRequestGet: Handler = async ({ request, env }) => {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  const q = new URL(request.url).searchParams;
  const day = Number(q.get('day')) || undefined;
  const limit = Math.min(Math.max(Number(q.get('limit')) || 200, 1), 1000);
  const events = await queryEvents(env.DB, {
    day,
    type: q.get('type') || undefined,
    device: q.get('device') || undefined,
    limit,
  });
  return json({ events });
};
