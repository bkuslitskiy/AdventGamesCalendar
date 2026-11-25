import type { Env, Handler } from '../../server/types.ts';
import { fail, json, nowMs, readJson } from '../../server/http.ts';
import { appendEvent } from '../../server/db.ts';
import { puzzleFor } from '../../server/content.ts';
import { iso, isLate, isOpen } from '../../src/core/time.ts';
import { GAME_NAMES, isGameId, type EventInput, type Stats } from '../../src/core/types.ts';

const ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Append an `identify` or `solve` from babe's device. Deliberately unauthenticated (see threat model). */
export const onRequestPost: Handler = async (ctx) => {
  const { request, env } = ctx;
  const body = await readJson<EventInput>(request);
  if (!body) return fail(400, 'invalid JSON');
  if (body.type !== 'identify' && body.type !== 'solve') return fail(400, 'type must be identify or solve');
  if (typeof body.clientId !== 'string' || !ID.test(body.clientId)) return fail(400, 'bad clientId');
  if (typeof body.device !== 'string' || !ID.test(body.device)) return fail(400, 'bad device');

  const now = nowMs(env);
  const tsClient = typeof body.tsClient === 'string' && !Number.isNaN(Date.parse(body.tsClient)) ? iso(Date.parse(body.tsClient)) : iso(now);
  const ua = request.headers.get('user-agent')?.slice(0, 200) ?? null;

  if (body.type === 'identify') {
    const { id } = await appendEvent(env.DB, { clientId: body.clientId, tsServer: iso(now), tsClient, device: body.device, ua, type: 'identify' });
    return json({ ok: true, id });
  }

  const { day, game, rev, payload } = body;
  if (typeof day !== 'number' || !isOpen(day, now)) return fail(400, 'day is not open');
  if (!isGameId(game)) return fail(400, 'unknown game');
  const puzzle = puzzleFor(day, game);
  if (!puzzle) return fail(404, 'no such puzzle');
  if (typeof rev !== 'string' || rev.length > 64) return fail(400, 'bad rev');
  if (!payload || typeof payload !== 'object' || !payload.board || !payload.stats) return fail(400, 'bad payload');

  const { id, duplicate } = await appendEvent(env.DB, {
    clientId: body.clientId,
    tsServer: iso(now),
    tsClient,
    device: body.device,
    ua,
    type: 'solve',
    day,
    game,
    rev,
    payload,
  });
  const late = isLate(tsClient, puzzle.deadline);
  if (!duplicate) ctx.waitUntil(ping(env, day, GAME_NAMES[game], late, payload.stats));
  return json({ ok: true, id, late, duplicate });
};

async function ping(env: Env, day: number, name: string, late: boolean, stats: Stats): Promise<void> {
  if (!env.NTFY_URL) return;
  const secs = Math.round((stats?.ms ?? 0) / 1000);
  const time = `${Math.floor(secs / 60)}m${String(secs % 60).padStart(2, '0')}s`;
  const misses = stats?.attempts ?? 0;
  try {
    await fetch(env.NTFY_URL, {
      method: 'POST',
      headers: { Title: `Advent: day ${day} ${name}`, Tags: late ? 'hourglass' : 'tada' },
      body: `Day ${day} ${name} solved ${late ? 'late' : 'on time'}, ${time}, ${misses} ${misses === 1 ? 'miss' : 'misses'}`,
    });
  } catch {
    // A failed ping never fails the solve.
  }
}
