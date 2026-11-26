import type { Handler } from '../../server/types.ts';
import { fail, isAdmin, json, nowMs, readJson } from '../../server/http.ts';
import { earlyAccess, puzzleFor } from '../../server/content.ts';
import { aiEnabled, aiJudge, aiModel } from '../../server/judge.ts';
import { blocksAi, GUESS_MAX, judge } from '../../src/core/pinpoint.ts';
import { dayOpen } from '../../src/core/time.ts';
import type { PinpointPuzzle } from '../../src/core/types.ts';

/** Is the AI judge wired up? Costs nothing: no model call. */
export const onRequestGet: Handler = ({ env }) => json({ ai: aiEnabled(env), model: aiModel(env) });

/**
 * Second opinion on a Pinpoint guess the word matcher rejected. Only open days (or the admin token, for
 * preview), only short guesses, and never for puzzles that opt out or guesses the author listed as wrong.
 * Replies { verdict: 'correct' | 'wrong' | 'unavailable', by: 'words' | 'ai' | null }. The answer is never sent.
 */
export const onRequestPost: Handler = async ({ request, env }) => {
  const body = await readJson<{ day?: unknown; guess?: unknown }>(request, 2_000);
  if (!body) return fail(400, 'invalid JSON');
  const { day, guess } = body;
  if (typeof day !== 'number' || !Number.isInteger(day)) return fail(400, 'bad day');
  if (!dayOpen(day, nowMs(env), earlyAccess(env)) && !isAdmin(request, env)) return fail(400, 'day is not open');
  const pub = puzzleFor(day, 'pinpoint');
  if (!pub) return fail(404, 'no such puzzle');
  if (typeof guess !== 'string') return fail(400, 'bad guess');
  const g = guess.trim();
  if (!g || g.length > GUESS_MAX) return fail(400, 'bad guess');

  const p = pub.data as PinpointPuzzle;
  if (judge(g, p) === 'correct') return json({ verdict: 'correct', by: 'words' });
  if (blocksAi(g, p)) return json({ verdict: 'wrong', by: 'words' });
  const verdict = await aiJudge(env, p, pub.rev, g);
  return json({ verdict, by: verdict === 'unavailable' ? null : 'ai' });
};
