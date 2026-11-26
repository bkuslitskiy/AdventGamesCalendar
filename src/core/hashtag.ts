import type { Cell, HashtagPuzzle } from './types.ts';

/**
 * Hashtag: four five-letter words in a # — two across (rows 2 and 4), two down (columns 2 and 4),
 * crossing at four squares. All 16 letters start on the board, scrambled; swap two at a time until every
 * square is green. Green is locked in. 12 swaps is par, but running past it never ends the game (no fail
 * state): the count just keeps going.
 *
 * Squares are referred to by index into SQUARES (the 16 letter squares, row by row), and a board's
 * letters are a 16-letter string in that order.
 */

export type Mark = 'hit' | 'near' | 'miss';

export const SIZE = 5;
export const WORD_LEN = 5;
export const PAR = 12;
export const BLANK = '#';
/** Rows of the across words, and columns of the down words. */
export const LINES = [1, 3];

export const onGrid = (r: number, c: number): boolean => LINES.includes(r) || LINES.includes(c);

/** The 16 letter squares, row by row. */
export const SQUARES: Cell[] = [];
for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (onGrid(r, c)) SQUARES.push([r, c]);

const indexOf = (r: number, c: number): number => SQUARES.findIndex(([y, x]) => y === r && x === c);

/** Square indices of each word, in reading order: across 1, across 2, down 1, down 2. */
export const WORD_SQUARES: number[][] = [
  ...LINES.map((r) => Array.from({ length: SIZE }, (_, c) => indexOf(r, c))),
  ...LINES.map((c) => Array.from({ length: SIZE }, (_, r) => indexOf(r, c))),
];

const clean = (s: string): string => String(s ?? '').trim().toUpperCase();

/** The solved board as 16 letters. */
export function solution(p: Pick<HashtagPuzzle, 'across' | 'down'>): string {
  const out = Array<string>(SQUARES.length).fill('?');
  const words = [...p.across, ...p.down].map(clean);
  WORD_SQUARES.forEach((sq, w) => sq.forEach((i, k) => (out[i] = words[w]?.[k] ?? '?')));
  return out.join('');
}

/** A 5×5 grid (`#` off the grid) as 16 letters. */
export const fromGrid = (rows: string[]): string => SQUARES.map(([r, c]) => clean(rows[r] ?? '')[c] ?? '?').join('');

/** 16 letters as a 5×5 grid. */
export function toGrid(tiles: string): string[] {
  const rows = Array.from({ length: SIZE }, () => Array<string>(SIZE).fill(BLANK));
  SQUARES.forEach(([r, c], i) => (rows[r]![c] = tiles[i] ?? '?'));
  return rows.map((r) => r.join(''));
}

export const startTiles = (p: HashtagPuzzle): string => fromGrid(p.start);

export function swap(tiles: string, a: number, b: number): string {
  const t = tiles.split('');
  [t[a], t[b]] = [t[b]!, t[a]!];
  return t.join('');
}

/**
 * Colour every square. Green: right letter, right square. Yellow: the letter is still needed somewhere
 * else in one of this square's words (counted, like Wordle, so two Es only light up as many squares as
 * the word still needs). Grey: it belongs in a different word.
 */
export function marks(target: string, tiles: string): Mark[] {
  const out: Mark[] = SQUARES.map((_, i) => (tiles[i] === target[i] ? 'hit' : 'miss'));
  for (const word of WORD_SQUARES) {
    const need = new Map<string, number>();
    for (const i of word) if (out[i] !== 'hit') need.set(target[i]!, (need.get(target[i]!) ?? 0) + 1);
    for (const i of word) {
      if (out[i] === 'hit') continue;
      const n = need.get(tiles[i]!) ?? 0;
      if (n > 0) {
        need.set(tiles[i]!, n - 1);
        out[i] = 'near';
      }
    }
  }
  return out;
}

/**
 * The fewest swaps that solve `tiles`, with an optimal sequence. Exact, even with repeated letters.
 *
 * Every optimal solution can be ordered so each swap puts the first wrong square right (cycles of the
 * letter graph are independent, and any cycle can be resolved from any of its squares). And when one swap
 * puts two squares right at once, taking it never costs a swap. So the search only branches over which
 * copy of the needed letter to bring in, which keeps it tiny.
 */
export function solve(target: string, tiles: string): [number, number][] {
  const memo = new Map<string, [number, number][]>();
  const go = (t: string): [number, number][] => {
    const hit = memo.get(t);
    if (hit) return hit;
    const i = [...t].findIndex((ch, k) => ch !== target[k]);
    if (i < 0) return [];
    const from: number[] = [];
    for (let j = i + 1; j < t.length; j++) if (t[j] === target[i] && t[j] !== target[j]) from.push(j);
    const both = from.find((j) => t[i] === target[j]);
    let best: [number, number][] | null = null;
    for (const j of both !== undefined ? [both] : from) {
      const rest = go(swap(t, i, j));
      if (!best || rest.length + 1 < best.length) best = [[i, j], ...rest];
    }
    memo.set(t, best!);
    return best!;
  };
  return go(tiles);
}

export const fewestSwaps = (target: string, tiles: string): number => solve(target, tiles).length;

/**
 * A swap that didn't bring the solve any closer: the fewest swaps left didn't drop. These count as misses.
 * (A swap can turn nothing green and still be on a best path, by splitting one tangle into two.)
 */
export const wasted = (target: string, before: string, after: string): boolean => fewestSwaps(target, after) >= fewestSwaps(target, before);

export function validateHashtag(p: HashtagPuzzle): string[] {
  const errors: string[] = [];
  const five = (w: unknown) => typeof w === 'string' && new RegExp(`^[A-Z]{${WORD_LEN}}$`).test(w);
  if (!Array.isArray(p.across) || p.across.length !== 2) errors.push('across needs exactly 2 words');
  if (!Array.isArray(p.down) || p.down.length !== 2) errors.push('down needs exactly 2 words');
  if (errors.length) return errors;
  const words = [...p.across, ...p.down];
  for (const w of words) if (!five(w)) errors.push(`"${w}" must be ${WORD_LEN} uppercase letters A–Z`);
  if (errors.length) return errors;
  if (new Set(words).size !== words.length) errors.push('the four words must all differ');

  // Where the words cross, they must share the letter.
  const names = ['across 1', 'across 2', 'down 1', 'down 2'];
  const at = new Map<number, [number, number]>();
  WORD_SQUARES.forEach((sq, w) =>
    sq.forEach((i, k) => {
      const prev = at.get(i);
      if (!prev) at.set(i, [w, k]);
      else if (words[prev[0]]![prev[1]] !== words[w]![k]) {
        const [r, c] = SQUARES[i]!;
        errors.push(`${names[prev[0]]} (${words[prev[0]]}) and ${names[w]} (${words[w]}) cross at row ${r + 1}, column ${c + 1} but have ${words[prev[0]]![prev[1]]} and ${words[w]![k]} there`);
      }
    }),
  );
  if (errors.length) return errors;

  if (!Array.isArray(p.start) || p.start.length !== SIZE || p.start.some((r) => typeof r !== 'string' || r.length !== SIZE)) {
    errors.push(`start must be ${SIZE} rows of ${SIZE} characters`);
    return errors;
  }
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const ch = p.start[r]![c]!;
      if (onGrid(r, c) && !/^[A-Z]$/.test(ch)) errors.push(`start row ${r + 1}, column ${c + 1}: expected a letter A–Z, got "${ch}"`);
      if (!onGrid(r, c) && ch !== BLANK) errors.push(`start row ${r + 1}, column ${c + 1}: off the grid, must be ${BLANK}`);
    }
  }
  if (errors.length) return errors;

  const target = solution(p);
  const tiles = startTiles(p);
  const sorted = (s: string) => [...s].sort().join('');
  if (sorted(target) !== sorted(tiles)) {
    errors.push(`start must hold exactly the solution's letters (${sorted(target)}), not ${sorted(tiles)}`);
    return errors;
  }
  const n = fewestSwaps(target, tiles);
  if (n === 0) errors.push('start is already solved');
  else if (n > PAR) errors.push(`start needs ${n} swaps at best; it must be solvable in ${PAR}`);
  return errors;
}

/**
 * Scramble the solution: `greens` squares stay put (they start green), every other square starts wrong,
 * and the fewest swaps needed is exactly `swaps`. Returns null if this random draw can't hit that.
 * The authoring tool calls it with different seeds until one works.
 */
export function scramble(target: string, rnd: () => number, { greens, swaps }: { greens: number; swaps: number }): string | null {
  const n = SQUARES.length;
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const moving = order.slice(greens);
  // A permutation of k squares made of c cycles takes k − c swaps.
  const cycles = moving.length - swaps;
  if (cycles < 1 || cycles * 2 > moving.length) return null;
  const lengths = Array<number>(cycles).fill(2);
  for (let extra = moving.length - cycles * 2; extra > 0; extra--) lengths[Math.floor(rnd() * cycles)]!++;
  const t = target.split('');
  let at = 0;
  for (const len of lengths) {
    const cyc = moving.slice(at, at + len);
    at += len;
    cyc.forEach((sq, k) => (t[cyc[(k + 1) % len]!] = target[sq]!));
  }
  const tiles = t.join('');
  // Repeated letters can land a letter on a twin's square (starting green) or open a shortcut.
  const startGreens = [...tiles].filter((ch, i) => ch === target[i]).length;
  if (startGreens !== greens || fewestSwaps(target, tiles) !== swaps) return null;
  return tiles;
}
