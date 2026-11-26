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

// ---- Containers ----
// "Things in a toolbox" is answered by naming what goes in it: "tools", "hand tools". So after in/on/inside/from,
// a container whose first part names its contents (toolbox, bookshelf, junk drawer, pencil case) can be stood in
// for by that first part. Only these container words count: "bedroom" doesn't make "beds" an answer.

const HOLDERS = ['box', 'case', 'bag', 'kit', 'chest', 'shelf', 'shelve', 'shed', 'bin', 'rack', 'basket', 'belt', 'drawer', 'pouch', 'jar', 'holder', 'board'];
const PREPS = new Set(['in', 'on', 'inside', 'from', 'into']);
const DETERMINERS = new Set(['a', 'an', 'the', 'your', 'my', 'someone', 'someones']);

interface Contents {
  /** What goes in the container, e.g. "tool". */
  part: string;
  /** The answer tokens it stands for, e.g. ["toolbox"], or ["pencil", "case"]. */
  covers: string[];
}

export function contentsOf(target: string): Contents[] {
  const w = normalize(target).split(' ').filter(Boolean).map(singular);
  const out: Contents[] = [];
  for (let i = 0; i < w.length; i++) {
    if (!PREPS.has(w[i]!)) continue;
    let j = i + 1;
    if (DETERMINERS.has(w[j] ?? '')) j++;
    const a = w[j];
    const b = w[j + 1];
    if (!a) continue;
    if (b && HOLDERS.includes(b) && a.length >= 3) out.push({ part: a, covers: [a, b] });
    const h = HOLDERS.find((x) => a.endsWith(x) && a.length - x.length >= 3);
    if (h) out.push({ part: a.slice(0, -h.length), covers: [a] });
  }
  return out;
}

/**
 * Close, or the guess contains every answer token with at most two extra. A container's contents stand in for it.
 * An extra word that is a clue's word disqualifies: "mason jar" names one clue, not the link "___ jar".
 */
function loose(guess: string, target: string, clueWords: Set<string> = new Set()): boolean {
  if (close(guess, target)) return true;
  const t = new Set(tokens(target));
  if (t.size === 0) return false;
  const inside = contentsOf(target);
  const g = new Set(tokens(guess).flatMap((x) => inside.find((c) => c.part === x)?.covers ?? [x]));
  const extra = [...g].filter((x) => !t.has(x));
  return [...t].every((x) => g.has(x)) && extra.length <= 2 && !extra.some((x) => clueWords.has(x));
}

export type Verdict = 'correct' | 'wrong';

/** Longest guess the input takes and the AI judge accepts. */
export const GUESS_MAX = 60;

/**
 * Guesses the AI judge never sees: the puzzle opts out (`ai: false`), or the guess is close to a `reject`
 * or `tests.reject` entry. Those lists are the author's word, so the AI can't overrule them.
 */
export function blocksAi(guess: string, p: Pick<PinpointPuzzle, 'ai' | 'reject' | 'tests'>): boolean {
  if (p.ai === false) return true;
  return [...(p.reject ?? []), ...(p.tests?.reject ?? [])].some((r) => close(guess, r));
}

export function judge(guess: string, p: Pick<PinpointPuzzle, 'answer' | 'aliases' | 'reject'> & { clues?: string[] }): Verdict {
  if (tokens(guess).length === 0) return 'wrong';
  if ((p.reject ?? []).some((r) => close(guess, r))) return 'wrong';
  const clueWords = new Set((p.clues ?? []).flatMap(tokens));
  if (loose(guess, p.answer, clueWords)) return 'correct';
  if ((p.aliases ?? []).some((a) => loose(guess, a, clueWords))) return 'correct';
  return 'wrong';
}

// ---- Endgame ----
// A miss on the last clue offers the answer. Declining buys EXTRA more guesses, then the offer comes
// back. After OFFERS offers have been declined, EXTRA more misses end the game and show the answer.
// With 5 clues: offers after misses 5 and 7, cut off at miss 9.

export const PINPOINT_EXTRA = 2;
export const PINPOINT_OFFERS = 2;

export type PinpointStage =
  /** Still revealing clues. */
  | { kind: 'clue' }
  /** Asking whether to show the answer. `nth` counts from 1; `last` means no offer follows this one. */
  | { kind: 'offer'; nth: number; last: boolean }
  /** Extra guesses after a declined offer. `left` until the next offer or the cut-off (`final`). */
  | { kind: 'extra'; left: number; final: boolean }
  /** Out of guesses: show the answer. */
  | { kind: 'cutoff' };

/** Misses at which the answer is offered. */
const offerPoints = (clues: number): number[] =>
  Array.from({ length: PINPOINT_OFFERS }, (_, i) => clues + i * PINPOINT_EXTRA);

export const pinpointCutoff = (clues: number): number => clues + PINPOINT_OFFERS * PINPOINT_EXTRA;

/**
 * Where the game stands after `misses` wrong guesses, with `declined` answer offers turned down.
 * An offer already passed counts as declined, so state saved before offers existed (no count) still works.
 */
export function pinpointStage(clues: number, misses: number, declined = 0): PinpointStage {
  if (misses < clues) return { kind: 'clue' };
  const cutoff = pinpointCutoff(clues);
  if (misses >= cutoff) return { kind: 'cutoff' };
  const offers = offerPoints(clues);
  const passed = offers.filter((o) => o < misses).length;
  const d = Math.max(declined, passed);
  if (offers.includes(misses) && d === passed) {
    return { kind: 'offer', nth: passed + 1, last: passed + 1 === offers.length };
  }
  const next = [...offers, cutoff].find((t) => t > misses)!;
  return { kind: 'extra', left: next - misses, final: next === cutoff };
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
