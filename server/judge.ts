import type { Env } from './types.ts';
import { judgeMessages, parseVerdict, replyText, type AiVerdict } from '../src/core/judge.ts';
import { normalize } from '../src/core/pinpoint.ts';
import type { PinpointPuzzle } from '../src/core/types.ts';

/**
 * Pinpoint's AI judge on Workers AI. There's no API key: the `AI` binding only works from this project's
 * Functions. On the Workers Free plan, use past the daily free allocation fails instead of billing, and a
 * failure here just means "Not quite".
 */

export const DEFAULT_MODEL = '@cf/google/gemma-4-26b-a4b-it';
const TIMEOUT_MS = 8000;

export const aiModel = (env: Env): string => env.ADVENT_AI_MODEL?.trim() || DEFAULT_MODEL;

/** On when the binding exists, unless ADVENT_AI is "0", "false" or "off". */
export function aiEnabled(env: Env): boolean {
  const v = env.ADVENT_AI?.trim().toLowerCase();
  return !!env.AI && !(v === '0' || v === 'false' || v === 'off');
}

/** Per-isolate memo so a repeated guess gets the same answer without another model call. */
const memo = new Map<string, AiVerdict>();

export async function aiJudge(env: Env, p: PinpointPuzzle, rev: string, guess: string): Promise<AiVerdict> {
  if (!aiEnabled(env)) return 'unavailable';
  const key = `${rev}\n${normalize(guess)}`;
  const seen = memo.get(key);
  if (seen) return seen;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const run = env.AI!.run(aiModel(env), {
      messages: judgeMessages(p, guess),
      max_completion_tokens: 128,
      temperature: 0,
      seed: 7,
    });
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('AI judge timed out')), TIMEOUT_MS);
    });
    const verdict = parseVerdict(replyText(await Promise.race([run, timeout])));
    if (verdict !== 'unavailable') {
      if (memo.size >= 500) memo.clear();
      memo.set(key, verdict);
    }
    return verdict;
  } catch (e) {
    console.error('AI judge failed:', e instanceof Error ? e.message : e);
    return 'unavailable';
  } finally {
    clearTimeout(timer);
  }
}
