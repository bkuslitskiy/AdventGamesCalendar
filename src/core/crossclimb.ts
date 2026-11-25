import type { CrossclimbPuzzle } from './types.ts';

/** Crossclimb: a word ladder, one letter changed per rung. Any valid order is accepted. */

export function oneApart(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++diff > 1) return false;
  return diff === 1;
}

export function isLadder(words: string[]): boolean {
  for (let i = 1; i < words.length; i++) if (!oneApart(words[i - 1]!, words[i]!)) return false;
  return true;
}

export const clean = (s: string): string => s.toUpperCase().replace(/[^A-Z]/g, '');

/** Is `guess` the end word that belongs at `position`, given the current rung order? */
export function endFits(
  p: CrossclimbPuzzle,
  orderWords: string[],
  position: 'top' | 'bottom',
  guess: string,
  otherGuess = '',
): boolean {
  const g = clean(guess);
  const ends = [clean(p.ends.top), clean(p.ends.bottom)];
  if (!ends.includes(g)) return false;
  const neighbor = position === 'top' ? orderWords[0] : orderWords[orderWords.length - 1];
  if (!neighbor || !oneApart(g, neighbor)) return false;
  // If both ends are filled they must be the two different end words.
  const o = clean(otherGuess);
  if (o && o === g && ends[0] !== ends[1]) return false;
  return true;
}

export function validateCrossclimb(p: CrossclimbPuzzle): string[] {
  const errors: string[] = [];
  const L = p.length;
  if (!Number.isInteger(L) || L < 3) errors.push('length must be an integer ≥ 3');
  if (!Array.isArray(p.rungs) || p.rungs.length < 2) errors.push('needs at least 2 middle rungs');
  const words = (p.rungs ?? []).map((r) => r.word);
  for (const [label, w] of [
    ...words.map((w, i) => [`rung ${i}`, w] as const),
    ['top', p.ends?.top] as const,
    ['bottom', p.ends?.bottom] as const,
  ]) {
    if (typeof w !== 'string' || !/^[A-Z]+$/.test(w)) errors.push(`${label}: must be uppercase A–Z`);
    else if (w.length !== L) errors.push(`${label}: ${w} is ${w.length} letters, expected ${L}`);
  }
  (p.rungs ?? []).forEach((r, i) => {
    if (!r.clue?.trim()) errors.push(`rung ${i}: missing clue`);
  });
  if (!p.ends?.clue?.trim()) errors.push('ends: missing shared clue');
  if (errors.length) return errors;
  if (!isLadder(words)) errors.push(`rungs are not a ladder in the authored order: ${words.join(' → ')}`);
  if (!oneApart(p.ends.top, words[0]!)) errors.push(`top ${p.ends.top} is not one letter from ${words[0]}`);
  if (!oneApart(p.ends.bottom, words[words.length - 1]!)) {
    errors.push(`bottom ${p.ends.bottom} is not one letter from ${words[words.length - 1]}`);
  }
  const all = [p.ends.top, ...words, p.ends.bottom];
  if (new Set(all).size !== all.length) errors.push('every word in the ladder must be different');
  return errors;
}
