import type { Handler } from '../../server/types.ts';
import { isAdmin, json, nowMs } from '../../server/http.ts';
import { earlyAccess, gamesFor } from '../../server/content.ts';
import { DAY_COUNT, dayOpen, earlyActive, iso, opensAt, todayN } from '../../src/core/time.ts';
import { EXPECTED_GAMES, type StateResponse } from '../../src/core/types.ts';

/**
 * Clock, today's number and each day's opening time and published games. No puzzle content.
 * `?preview=1` with the admin token opens every day (admin preview).
 * Early access (pre-launch testing) opens every day until Day 1 opens.
 */
export const onRequestGet: Handler = ({ request, env }) => {
  const now = nowMs(env);
  const preview = new URL(request.url).searchParams.has('preview') && isAdmin(request, env);
  const early = earlyAccess(env);
  const body: StateResponse = {
    now: iso(now),
    today: todayN(now),
    early: earlyActive(now, early),
    expected: EXPECTED_GAMES,
    days: Array.from({ length: DAY_COUNT }, (_, i) => {
      const n = i + 1;
      const open = preview || dayOpen(n, now, early);
      return { n, opensAt: iso(opensAt(n)), open, games: open ? gamesFor(n) : [] };
    }),
  };
  return json(body);
};
