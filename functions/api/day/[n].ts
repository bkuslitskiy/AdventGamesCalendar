import type { Handler } from '../../../server/types.ts';
import { fail, isAdmin, json, nowMs } from '../../../server/http.ts';
import { dayContent, earlyAccess } from '../../../server/content.ts';
import { dayOpen, iso, opensAt, DAY_COUNT } from '../../../src/core/time.ts';
import type { DayResponse } from '../../../src/core/types.ts';

/** One day's puzzles. 404 until the day opens (or early access is on); the admin token skips the gate (preview). */
export const onRequestGet: Handler<'n'> = ({ request, env, params }) => {
  const n = Number(params.n);
  if (!Number.isInteger(n) || n < 1 || n > DAY_COUNT) return fail(404, 'no such day');
  if (!dayOpen(n, nowMs(env), earlyAccess(env)) && !isAdmin(request, env)) return fail(404, 'locked');
  const d = dayContent(n);
  const body: DayResponse = { n, opensAt: iso(opensAt(n)), puzzles: d?.puzzles ?? {} };
  if (d?.afterword) body.afterword = d.afterword;
  return json(body);
};
