import { isLate } from './time.ts';
import { solveKey, type GameId, type LogEvent, type SolveKey, type SolvePayload, type SolveRecord } from './types.ts';

/**
 * Rebuild progress from the append-only log.
 * - A `void` hides the events it lists; voiding a void restores them (voids only target earlier ids).
 * - A `reset` clears solves for its day (and game, if given).
 * - The first surviving `solve` after the latest reset wins.
 */
export function replay(
  events: LogEvent[],
  deadlineFor: (day: number, game: GameId) => string | undefined,
): SolveRecord[] {
  const sorted = [...events].sort((a, b) => a.id - b.id);

  const voided = new Set<number>();
  for (let i = sorted.length - 1; i >= 0; i--) {
    const e = sorted[i]!;
    if (e.type !== 'void' || voided.has(e.id)) continue;
    const ids = (e.payload as { ids?: unknown } | null)?.ids;
    if (Array.isArray(ids)) for (const id of ids) if (typeof id === 'number' && id < e.id) voided.add(id);
  }

  const solves = new Map<SolveKey, SolveRecord>();
  for (const e of sorted) {
    if (voided.has(e.id) || e.day == null) continue;
    if (e.type === 'reset') {
      for (const k of [...solves.keys()]) {
        const s = solves.get(k)!;
        if (s.day === e.day && (e.game == null || s.game === e.game)) solves.delete(k);
      }
    } else if (e.type === 'solve' && e.game) {
      const k = solveKey(e.day, e.game);
      if (solves.has(k)) continue;
      const ts = e.tsClient && !Number.isNaN(Date.parse(e.tsClient)) ? e.tsClient : e.tsServer;
      const deadline = deadlineFor(e.day, e.game);
      solves.set(k, {
        day: e.day,
        game: e.game,
        rev: e.rev ?? '',
        tsClient: ts,
        late: deadline ? isLate(ts, deadline) : false,
        payload: e.payload as SolvePayload,
      });
    }
  }
  return [...solves.values()].sort((a, b) => a.day - b.day || a.game.localeCompare(b.game));
}
