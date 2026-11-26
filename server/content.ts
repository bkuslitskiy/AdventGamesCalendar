import { CONTENT, INCLUDES_DRAFTS } from './content.generated.ts';
import type { Env } from './types.ts';
import type { DayContent, GameId, PublishedPuzzle } from '../src/core/types.ts';
import { ALL_GAMES } from '../src/core/types.ts';

/**
 * Pre-launch testing switch. ADVENT_EARLY_ACCESS=1 or 0 decides; unset, it follows the build:
 * on wherever drafts are bundled (local dev, preview branches), off in production.
 * It only ever opens days before Day 1 opens (see dayOpen in src/core/time.ts).
 */
export function earlyAccess(env: Env): boolean {
  const v = env.ADVENT_EARLY_ACCESS?.trim().toLowerCase();
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  return INCLUDES_DRAFTS;
}

export function dayContent(n: number): DayContent | undefined {
  return CONTENT[n];
}

export function gamesFor(n: number): GameId[] {
  const d = CONTENT[n];
  if (!d) return [];
  return ALL_GAMES.filter((g) => d.puzzles[g]);
}

export function puzzleFor(n: number, game: GameId): PublishedPuzzle | undefined {
  return CONTENT[n]?.puzzles[game] as PublishedPuzzle | undefined;
}

export const deadlineFor = (n: number, game: GameId): string | undefined => puzzleFor(n, game)?.deadline;
