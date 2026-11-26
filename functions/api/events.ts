import type { Env, Handler } from '../../server/types.ts';
import { fail, json, nowMs, readJson } from '../../server/http.ts';
import { appendEvent } from '../../server/db.ts';
import { earlyAccess, puzzleFor } from '../../server/content.ts';
import { dayOpen, iso, isLate } from '../../src/core/time.ts';
import { GAME_NAMES, isGameId, pinpointShown, type EventInput, type PinpointBoard, type Stats } from '../../src/core/types.ts';

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
  if (typeof day !== 'number' || !dayOpen(day, now, earlyAccess(env))) return fail(400, 'day is not open');
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
  const shown = game === 'pinpoint' ? pinpointShown(payload.board) : undefined;
  const b = payload.board as PinpointBoard;
  const aiGuess = game === 'pinpoint' && b.aiAccepted && Array.isArray(b.guesses) ? String(b.guesses[b.guesses.length - 1] ?? '').slice(0, 60) : null;
  if (!duplicate) ctx.waitUntil(ping(env, day, GAME_NAMES[game], late, payload.stats, shown, aiGuess));
  return json({ ok: true, id, late, duplicate });
};

const ENDED = { asked: 'asked for the answer', cutoff: 'cut off' } as const;

async function ping(env: Env, day: number, name: string, late: boolean, stats: Stats, shown?: keyof typeof ENDED, aiGuess?: string | null): Promise<void> {
  if (!env.NTFY_URL) return;
  const secs = Math.round((stats?.ms ?? 0) / 1000);
  const time = `${Math.floor(secs / 60)}m${String(secs % 60).padStart(2, '0')}s`;
  const misses = stats?.attempts ?? 0;
  try {
    await fetch(env.NTFY_URL, {
      method: 'POST',
      headers: { Title: `Advent: day ${day} ${name}`, Tags: shown ? 'see_no_evil' : late ? 'hourglass' : 'tada' },
      body: `Day ${day} ${name} ${shown ? `${ENDED[shown]},` : 'solved'} ${late ? 'late' : 'on time'}, ${time}, ${misses} ${misses === 1 ? 'miss' : 'misses'}${aiGuess ? `, AI accepted "${aiGuess}"` : ''}`,
    });
  } catch {
    // A failed ping never fails the solve.
  }
}
