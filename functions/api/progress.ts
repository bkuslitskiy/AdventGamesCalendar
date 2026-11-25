import type { Handler } from '../../server/types.ts';
import { json } from '../../server/http.ts';
import { allEvents } from '../../server/db.ts';
import { deadlineFor } from '../../server/content.ts';
import { replay } from '../../src/core/replay.ts';
import type { ProgressResponse } from '../../src/core/types.ts';

/** Babe's solves, rebuilt from the log. */
export const onRequestGet: Handler = async ({ env }) => {
  const events = await allEvents(env.DB);
  const body: ProgressResponse = { solves: replay(events, deadlineFor) };
  return json(body);
};
