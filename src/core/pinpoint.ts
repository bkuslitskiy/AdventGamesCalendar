import type { PinpointPuzzle } from './types.ts';

/**
 * Loose matching around one canonical answer. Deterministic, no dictionary.
 * Tune per puzzle with `aliases`, `reject` and `tests` (checked by the validator).
 */

const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'for', 'to', 'with', 'that', 'are', 'is', 'be', 'you',
  'can', 'some', 'your', 'from', 'by', 'or',
]);

/** Generic category nouns that carry no meaning on their own ("things", "items", "types of"). */
const FILLER = new Set(['thing', 'item', 'stuff', 'type', 'kind', 'sort', 'example', 'object']);

export function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function singular(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('sses')) return w.slice(0, -2);
  if (/(ss|us|is)$/.test(w)) return w;
  if (/(xes|ches|shes|zes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s')) return w.slice(0, -1);
  return w;
}

export function tokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter(Boolean)
    .map(singular)
    .filter((t) => !STOPWORDS.has(t) && !FILLER.has(t));
}

/** Optimal string alignment distance (Levenshtein + adjacent transpositions). */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array<number>(n + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= n; j++) d[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  }
  return d[m]![n]!;
}

const tolerance = (len: number): number => (len >= 10 ? 2 : len >= 5 ? 1 : 0);

function close(guess: string, target: string): boolean {
  const g = tokens(guess);
  const t = tokens(target);
  if (t.length === 0) return normalize(guess) === normalize(target);
  const gc = g.join('');
  const tc = t.join('');
  if (gc === tc) return true;
  const gs = new Set(g);
  const ts = new Set(t);
  if (gs.size === ts.size && [...ts].every((x) => gs.has(x))) return true;
  return editDistance(gc, tc) <= tolerance(tc.length);
}

/** Close, or the guess contains every answer token with at most two extra. */
function loose(guess: string, target: string): boolean {
  if (close(guess, target)) return true;
  const g = new Set(tokens(guess));
  const t = new Set(tokens(target));
  if (t.size === 0) return false;
  return [...t].every((x) => g.has(x)) && g.size - t.size <= 2;
}

export type Verdict = 'correct' | 'wrong';

export function judge(guess: string, p: Pick<PinpointPuzzle, 'answer' | 'aliases' | 'reject'>): Verdict {
  if (tokens(guess).length === 0) return 'wrong';
  if ((p.reject ?? []).some((r) => close(guess, r))) return 'wrong';
  if (loose(guess, p.answer)) return 'correct';
  if ((p.aliases ?? []).some((a) => loose(guess, a))) return 'correct';
  return 'wrong';
}

export function validatePinpoint(p: PinpointPuzzle): string[] {
  const errors: string[] = [];
  if (!Array.isArray(p.clues) || p.clues.length !== 5) errors.push('needs exactly 5 clues');
  if (!p.answer || tokens(p.answer).length === 0) errors.push('answer is empty after normalising');
  for (const a of p.tests?.accept ?? []) {
    if (judge(a, p) !== 'correct') errors.push(`test expected accept: "${a}"`);
  }
  for (const r of p.tests?.reject ?? []) {
    if (judge(r, p) !== 'wrong') errors.push(`test expected reject: "${r}"`);
  }
  for (const c of p.clues ?? []) {
    if (judge(c, p) === 'correct') errors.push(`a clue is itself accepted as the answer: "${c}"`);
  }
  return errors;
}
