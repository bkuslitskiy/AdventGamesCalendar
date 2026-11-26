import type { WordlePuzzle } from './types.ts';

/** Wordle: guess the word; each letter is marked hit (right spot), near (elsewhere) or miss. */

export type Mark = 'hit' | 'near' | 'miss';

/** Rows drawn before the first guess. Running out isn't a fail: another row appears (no fail state). */
export const ROWS = 6;
export const MIN_LEN = 4;
export const MAX_LEN = 7;

export const clean = (s: string): string => s.toUpperCase().replace(/[^A-Z]/g, '');

/** Standard scoring: hits first, then nears limited by how many of each letter are left over. */
export function score(guess: string, answer: string): Mark[] {
  const g = guess.toUpperCase();
  const a = answer.toUpperCase();
  const marks: Mark[] = Array.from({ length: g.length }, () => 'miss');
  const left = new Map<string, number>();
  for (let i = 0; i < a.length; i++) {
    if (g[i] === a[i]) marks[i] = 'hit';
    else left.set(a[i]!, (left.get(a[i]!) ?? 0) + 1);
  }
  for (let i = 0; i < g.length; i++) {
    if (marks[i] === 'hit') continue;
    const n = left.get(g[i]!) ?? 0;
    if (n > 0) {
      marks[i] = 'near';
      left.set(g[i]!, n - 1);
    }
  }
  return marks;
}

const RANK: Record<Mark, number> = { miss: 0, near: 1, hit: 2 };

/** Best mark seen for each letter across all guesses, for colouring the keyboard. */
export function keyStates(guesses: string[], answer: string): Record<string, Mark> {
  const out: Record<string, Mark> = {};
  for (const g of guesses) {
    score(g, answer).forEach((m, i) => {
      const ch = g[i]!.toUpperCase();
      if (!out[ch] || RANK[m] > RANK[out[ch]!]) out[ch] = m;
    });
  }
  return out;
}

export type GuessCheck = 'ok' | 'short' | 'unknown' | 'repeat';

/**
 * Can this guess be played? `words` is the dictionary (uppercase); null means it couldn't load, so any
 * string of the right length is allowed rather than blocking the puzzle.
 */
export function checkGuess(p: WordlePuzzle, guess: string, previous: string[], words: ReadonlySet<string> | null): GuessCheck {
  const g = clean(guess);
  const a = clean(p.answer);
  if (g.length !== a.length) return 'short';
  if (previous.includes(g)) return 'repeat';
  if (g === a || (p.allowed ?? []).some((x) => clean(x) === g)) return 'ok';
  if (words && !words.has(g)) return 'unknown';
  return 'ok';
}

export function validateWordle(p: WordlePuzzle): string[] {
  const errors: string[] = [];
  if (typeof p.answer !== 'string' || !/^[A-Z]+$/.test(p.answer)) {
    errors.push('answer must be uppercase A–Z');
    return errors;
  }
  const L = p.answer.length;
  if (L < MIN_LEN || L > MAX_LEN) errors.push(`answer must be ${MIN_LEN}–${MAX_LEN} letters (got ${L})`);
  for (const w of p.allowed ?? []) {
    if (typeof w !== 'string' || !/^[A-Z]+$/.test(w)) errors.push(`allowed: "${w}" must be uppercase A–Z`);
    else if (w.length !== L) errors.push(`allowed: ${w} is ${w.length} letters, the answer is ${L}`);
  }
  return errors;
}
