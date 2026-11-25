import { solveKey, type GameId, type SolveKey, type SolveRecord } from './types.ts';

/**
 * locked   — not open yet
 * empty    — open, but nothing published for it yet
 * unsolved — at least one published game has no solve
 * late     — everything solved, at least one late
 * ontime   — everything solved on its day
 */
export type DayStatus = 'locked' | 'empty' | 'unsolved' | 'late' | 'ontime';

export function dayStatus(
  n: number,
  open: boolean,
  games: GameId[],
  solves: Map<SolveKey, SolveRecord>,
): DayStatus {
  if (!open) return 'locked';
  if (games.length === 0) return 'empty';
  let late = false;
  for (const g of games) {
    const s = solves.get(solveKey(n, g));
    if (!s) return 'unsolved';
    if (s.late) late = true;
  }
  return late ? 'late' : 'ontime';
}

export type GameStatus = 'unsolved' | 'late' | 'ontime';

export function gameStatus(n: number, game: GameId, solves: Map<SolveKey, SolveRecord>): GameStatus {
  const s = solves.get(solveKey(n, game));
  if (!s) return 'unsolved';
  return s.late ? 'late' : 'ontime';
}
