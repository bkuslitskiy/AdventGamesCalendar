import type { Cell, MiniPuzzle } from './types.ts';

/** Mini: a small crossword. Numbering follows the usual rules; the grid is solved when every square matches. */

export const BLOCK = '#';
export const MAX_SIZE = 9;

export type Dir = 'across' | 'down';

export interface Entry {
  num: number;
  dir: Dir;
  cells: Cell[];
  answer: string;
}

export const isWhite = (grid: string[], r: number, c: number): boolean =>
  r >= 0 && r < grid.length && c >= 0 && c < (grid[r]?.length ?? 0) && grid[r]![c] !== BLOCK;

/** Every across and down entry of two or more squares, numbered in reading order. */
export function entries(grid: string[]): Entry[] {
  const out: Entry[] = [];
  let num = 0;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r]!.length; c++) {
      if (!isWhite(grid, r, c)) continue;
      const across = !isWhite(grid, r, c - 1) && isWhite(grid, r, c + 1);
      const down = !isWhite(grid, r - 1, c) && isWhite(grid, r + 1, c);
      if (!across && !down) continue;
      num++;
      if (across) {
        const cells: Cell[] = [];
        for (let x = c; isWhite(grid, r, x); x++) cells.push([r, x]);
        out.push({ num, dir: 'across', cells, answer: cells.map(([y, x]) => grid[y]![x]).join('') });
      }
      if (down) {
        const cells: Cell[] = [];
        for (let y = r; isWhite(grid, y, c); y++) cells.push([y, c]);
        out.push({ num, dir: 'down', cells, answer: cells.map(([y, x]) => grid[y]![x]).join('') });
      }
    }
  }
  return out;
}

/** Clue number printed in each square that starts an entry. Keyed "r,c". */
export function numbering(grid: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entries(grid)) m.set(`${e.cells[0]![0]},${e.cells[0]![1]}`, e.num);
  return m;
}

/** `fill` uses the same shape as the grid, with ' ' (or any non-letter) for an empty square. */
export function isFull(grid: string[], fill: string[]): boolean {
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r]!.length; c++) {
      if (isWhite(grid, r, c) && !/[A-Z]/.test(fill[r]?.[c] ?? '')) return false;
    }
  }
  return true;
}

export function isSolved(grid: string[], fill: string[]): boolean {
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r]!.length; c++) {
      if (isWhite(grid, r, c) && fill[r]?.[c] !== grid[r]![c]) return false;
    }
  }
  return true;
}

export function validateMini(p: MiniPuzzle): string[] {
  const errors: string[] = [];
  const g = p.grid;
  if (!Array.isArray(g) || g.length < 2) return ['grid needs at least 2 rows'];
  const W = g[0]?.length ?? 0;
  if (g.length > MAX_SIZE || W > MAX_SIZE) errors.push(`grid is ${W}×${g.length}; at most ${MAX_SIZE}×${MAX_SIZE} fits a phone`);
  g.forEach((row, r) => {
    if (typeof row !== 'string' || !/^[A-Z#]+$/.test(row)) errors.push(`row ${r}: use uppercase A–Z and # only`);
    else if (row.length !== W) errors.push(`row ${r}: ${row.length} wide, row 0 is ${W}`);
  });
  if (errors.length) return errors;

  const list = entries(g);
  const covered = new Set(list.flatMap((e) => e.cells.map(([r, c]) => `${r},${c}`)));
  for (let r = 0; r < g.length; r++) {
    for (let c = 0; c < W; c++) {
      if (isWhite(g, r, c) && !covered.has(`${r},${c}`)) errors.push(`square [${r},${c}] isn't part of any word`);
    }
  }

  for (const dir of ['across', 'down'] as const) {
    const want = list.filter((e) => e.dir === dir).map((e) => String(e.num));
    const clues = p.clues?.[dir] ?? {};
    const have = Object.keys(clues);
    const missing = want.filter((n) => !have.includes(n));
    const extra = have.filter((n) => !want.includes(n));
    if (missing.length || extra.length) {
      errors.push(`${dir} clues should be numbered ${want.join(', ')}${missing.length ? `; missing ${missing.join(', ')}` : ''}${extra.length ? `; no ${dir} entry for ${extra.join(', ')}` : ''}`);
    }
    for (const n of have) if (typeof clues[n] !== 'string' || !clues[n]!.trim()) errors.push(`${n} ${dir}: empty clue`);
  }

  const answers = list.map((e) => e.answer);
  const dupes = answers.filter((a, i) => answers.indexOf(a) !== i);
  if (dupes.length) errors.push(`answers repeat: ${[...new Set(dupes)].join(', ')}`);
  return errors;
}
