import type { Handler } from '../../server/types.ts';
import { json, requireBabe } from '../../server/http.ts';
import { allEvents } from '../../server/db.ts';
import { deadlineFor } from '../../server/content.ts';
import { replay } from '../../src/core/replay.ts';
import type { ProgressResponse } from '../../src/core/types.ts';

/** Babe's solves, rebuilt from the log. For babe's devices (BABE_KEY) and the admin page (ADMIN_TOKEN). */
export const onRequestGet: Handler = async ({ request, env }) => {
  const denied = requireBabe(request, env, { orAdmin: true });
  if (denied) return denied;
  const events = await allEvents(env.DB);
  const body: ProgressResponse = { solves: replay(events, deadlineFor) };
  return json(body);
};
