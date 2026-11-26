import { CONTENT } from './content.generated.ts';
export { BUILT_AT } from './content.generated.ts';
import type { Env } from './types.ts';
import type { DayContent, GameId, PublishedPuzzle } from '../src/core/types.ts';
import { ALL_GAMES } from '../src/core/types.ts';

/**
 * Pre-launch testing switch: on everywhere (production included) unless ADVENT_EARLY_ACCESS is "0".
 * It only ever opens days before Day 1 opens (see dayOpen in src/core/time.ts), so it ends by itself
 * at midnight ET on Dec 1.
 */
export function earlyAccess(env: Env): boolean {
  const v = env.ADVENT_EARLY_ACCESS?.trim().toLowerCase();
  return !(v === '0' || v === 'false' || v === 'off');
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
