import type { Cell, WendPuzzle } from './types.ts';

/**
 * Wend: words wind through a letter grid with walls, every letter used once, orthogonal moves only.
 * Exactly one end state is accepted: the authored placement.
 */

export const WALL = '#';
export const OPEN = '.';

export const key = (c: Cell): number => c[0] * 64 + c[1];
export const fromKey = (k: number): Cell => [Math.floor(k / 64), k % 64];

export function adjacent(a: Cell, b: Cell): boolean {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
}

export function letterAt(grid: string[], c: Cell): string | undefined {
  return grid[c[0]]?.[c[1]];
}

export function isCell(grid: string[], c: Cell): boolean {
  const ch = letterAt(grid, c);
  return ch !== undefined && ch !== WALL;
}

export function spell(grid: string[], path: Cell[]): string {
  return path.map((c) => letterAt(grid, c) ?? '?').join('');
}

export function sameCells(a: Cell[], b: Cell[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a.map(key));
  return b.every((c) => s.has(key(c)));
}

export type TraceResult =
  | { ok: true; index: number }
  | { ok: false; reason: 'too-short' | 'not-an-answer' | 'wrong-place' };

/**
 * Judge a traced path. Accepted only if it spells an unfound answer AND covers exactly that answer's
 * authored cells (direction-independent for repeated letters). A right word elsewhere is 'wrong-place'.
 */
export function judgeTrace(p: WendPuzzle, found: ReadonlySet<number>, path: Cell[]): TraceResult {
  if (path.length < 2) return { ok: false, reason: 'too-short' };
  const s = spell(p.grid, path);
  let sawWord = false;
  for (let i = 0; i < p.words.length; i++) {
    if (found.has(i)) continue;
    const w = p.words[i]!;
    if (w.word.toUpperCase() !== s) continue;
    sawWord = true;
    if (sameCells(w.path, path)) return { ok: true, index: i };
  }
  return { ok: false, reason: sawWord ? 'wrong-place' : 'not-an-answer' };
}

export function validateWend(p: WendPuzzle): string[] {
  const errors: string[] = [];
  const grid = p.grid;
  if (!Array.isArray(grid) || grid.length === 0) return ['grid is empty'];
  const width = grid[0]!.length;
  grid.forEach((row, r) => {
    if (row.length !== width) errors.push(`row ${r} has length ${row.length}, expected ${width}`);
    if (!/^[A-Z#]+$/.test(row)) errors.push(`row ${r} must be A–Z or # only`);
  });
  if (!Array.isArray(p.words) || p.words.length === 0) errors.push('no words');
  const used = new Map<number, number>();
  (p.words ?? []).forEach((w, i) => {
    const label = `word ${i} (${w.word})`;
    if (!/^[A-Z]+$/.test(w.word)) errors.push(`${label}: must be uppercase A–Z`);
    if (!Array.isArray(w.path) || w.path.length !== w.word.length) {
      errors.push(`${label}: path length ${w.path?.length ?? 0} ≠ word length ${w.word.length}`);
      return;
    }
    w.path.forEach((c, j) => {
      if (!isCell(grid, c)) errors.push(`${label}: step ${j} [${c}] is a wall or off the grid`);
      else if (letterAt(grid, c) !== w.word[j]) errors.push(`${label}: step ${j} [${c}] is ${letterAt(grid, c)}, expected ${w.word[j]}`);
      if (j > 0 && !adjacent(w.path[j - 1]!, c)) errors.push(`${label}: step ${j} [${c}] is not orthogonally adjacent`);
      const k = key(c);
      if (used.has(k)) errors.push(`${label}: cell [${c}] already used by word ${used.get(k)}`);
      used.set(k, i);
    });
  });
  grid.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== WALL && !used.has(key([r, c]))) errors.push(`cell [${r},${c}] (${row[c]}) is not in any word`);
    }
  });
  return errors;
}

// ---- Search (exact cover by paths) ----

interface SearchCtx {
  rows: number;
  cols: number;
  free: Set<number>;
}

function neighbors(c: Cell, ctx: SearchCtx): Cell[] {
  const out: Cell[] = [];
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    const n: Cell = [c[0] + dr, c[1] + dc];
    if (ctx.free.has(key(n))) out.push(n);
  }
  return out;
}

/** Every simple path of `len` free cells that includes `must`, filtered by `letterOk(cell, index)`. */
function* pathsThrough(
  must: Cell,
  len: number,
  ctx: SearchCtx,
  letterOk: (c: Cell, i: number) => boolean,
  rnd?: () => number,
): Generator<Cell[]> {
  const mk = key(must);
  const dist = (c: Cell) => Math.abs(c[0] - must[0]) + Math.abs(c[1] - must[1]);
  const mix = <T>(xs: T[]): T[] => (rnd ? xs.sort(() => rnd() - 0.5) : xs);
  const starts = mix([...ctx.free].map(fromKey).filter((c) => dist(c) < len && letterOk(c, 0)));
  const path: Cell[] = [];
  const onPath = new Set<number>();
  function* walk(c: Cell, hasMust: boolean): Generator<Cell[]> {
    path.push(c);
    onPath.add(key(c));
    const nowHas = hasMust || key(c) === mk;
    if (path.length === len) {
      if (nowHas) yield path.slice();
    } else if (nowHas || dist(c) <= len - path.length) {
      for (const n of mix(neighbors(c, ctx))) {
        if (!onPath.has(key(n)) && letterOk(n, path.length)) yield* walk(n, nowHas);
      }
    }
    path.pop();
    onPath.delete(key(c));
  }
  for (const s of starts) yield* walk(s, false);
}

function firstFree(ctx: SearchCtx): Cell | null {
  let best = Infinity;
  for (const k of ctx.free) if (k < best) best = k;
  return best === Infinity ? null : fromKey(best);
}

/** Every free region must be at least as big as the shortest remaining word. */
function regionsFeasible(ctx: SearchCtx, minLen: number): boolean {
  const seen = new Set<number>();
  for (const k of ctx.free) {
    if (seen.has(k)) continue;
    let size = 0;
    const stack = [fromKey(k)];
    seen.add(k);
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      for (const n of neighbors(c, ctx)) {
        if (!seen.has(key(n))) {
          seen.add(key(n));
          stack.push(n);
        }
      }
    }
    if (size < minLen) return false;
  }
  return true;
}

function makeCtx(grid: string[]): SearchCtx {
  const free = new Set<number>();
  grid.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] !== WALL) free.add(key([r, c]));
  });
  return { rows: grid.length, cols: grid[0]?.length ?? 0, free };
}

/**
 * How many ways the letter grid splits into exactly these words (stops at `limit`).
 * The authored placement is one; more than one means a player can find a "valid" layout we reject.
 */
export function countPlacements(grid: string[], words: string[], limit = 2): number {
  const ctx = makeCtx(grid);
  const total = words.reduce((s, w) => s + w.length, 0);
  if (total !== ctx.free.size) return 0;
  const used = new Array<boolean>(words.length).fill(false);
  let count = 0;
  const rec = () => {
    if (count >= limit) return;
    const c = firstFree(ctx);
    if (!c) {
      count++;
      return;
    }
    const remaining = words.filter((_, i) => !used[i]);
    if (!regionsFeasible(ctx, Math.min(...remaining.map((w) => w.length)))) return;
    const tried = new Set<string>();
    for (let i = 0; i < words.length && count < limit; i++) {
      const w = words[i]!;
      if (used[i] || tried.has(w)) continue;
      tried.add(w);
      used[i] = true;
      for (const p of pathsThrough(c, w.length, ctx, (cell, j) => letterAt(grid, cell) === w[j])) {
        for (const cell of p) ctx.free.delete(key(cell));
        rec();
        for (const cell of p) ctx.free.add(key(cell));
        if (count >= limit) break;
      }
      used[i] = false;
    }
  };
  rec();
  return count;
}

/**
 * Lay words into a grid shape (`.` open, `#` wall). Returns a puzzle, or null if impossible.
 * `rnd` varies the layout between runs.
 */
export function layout(shape: string[], words: string[], rnd: () => number = Math.random): WendPuzzle | null {
  const ctx = makeCtx(shape);
  const upper = words.map((w) => w.toUpperCase());
  if (upper.reduce((s, w) => s + w.length, 0) !== ctx.free.size) return null;
  const letters = new Map<number, string>();
  const paths: (Cell[] | null)[] = upper.map(() => null);
  const order = upper.map((_, i) => i).sort(() => rnd() - 0.5);
  let steps = 0;
  const rec = (): boolean => {
    if (++steps > 200_000) return false;
    const c = firstFree(ctx);
    if (!c) return true;
    const remaining = order.filter((i) => !paths[i]);
    if (!regionsFeasible(ctx, Math.min(...remaining.map((i) => upper[i]!.length)))) return false;
    for (const i of remaining) {
      const w = upper[i]!;
      const options: Cell[][] = [];
      for (const p of pathsThrough(c, w.length, ctx, () => true, rnd)) {
        options.push(p);
        if (options.length >= 40) break;
      }
      for (const p of options) {
        paths[i] = p;
        p.forEach((cell, j) => {
          ctx.free.delete(key(cell));
          letters.set(key(cell), w[j]!);
        });
        if (rec()) return true;
        p.forEach((cell) => {
          ctx.free.add(key(cell));
          letters.delete(key(cell));
        });
        paths[i] = null;
      }
    }
    return false;
  };
  if (!rec()) return null;
  const grid = shape.map((row, r) =>
    [...row].map((ch, c) => (ch === WALL ? WALL : letters.get(key([r, c])) ?? '?')).join(''),
  );
  return { grid, words: upper.map((word, i) => ({ word, path: paths[i]! })) };
}
