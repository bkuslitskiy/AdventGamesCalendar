import { CONTENT } from './content.generated.ts';
import type { DayContent, GameId, PublishedPuzzle } from '../src/core/types.ts';
import { ALL_GAMES } from '../src/core/types.ts';

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
