import type { ConnectionsPuzzle } from './types.ts';

/** Connections: sixteen words, four hidden groups of four. No mistake limit; misses are counted. */

export const GROUPS = 4;
export const GROUP_SIZE = 4;
/** Longest word that still fits a tile on a phone. */
export const MAX_WORD = 14;

/** Tiles show words uppercase with single spaces. */
export const norm = (w: string): string => w.trim().toUpperCase().replace(/\s+/g, ' ');

/** Order-insensitive key for a guess, to spot repeats. */
export const guessKey = (words: string[]): string => words.map(norm).sort().join('|');

export type GroupVerdict = { kind: 'group'; index: number } | { kind: 'one-away' } | { kind: 'wrong' };

/** Judge four selected words against the groups not yet found. */
export function judgeGroup(p: ConnectionsPuzzle, selection: string[], found: ReadonlySet<number> = new Set()): GroupVerdict {
  const sel = new Set(selection.map(norm));
  if (sel.size !== GROUP_SIZE) return { kind: 'wrong' };
  let best = 0;
  for (let i = 0; i < p.groups.length; i++) {
    if (found.has(i)) continue;
    const hits = p.groups[i]!.words.filter((w) => sel.has(norm(w))).length;
    if (hits === GROUP_SIZE) return { kind: 'group', index: i };
    best = Math.max(best, hits);
  }
  return best === GROUP_SIZE - 1 ? { kind: 'one-away' } : { kind: 'wrong' };
}

/** Which group a word belongs to, or -1. */
export function groupOf(p: ConnectionsPuzzle, word: string): number {
  const w = norm(word);
  return p.groups.findIndex((g) => g.words.some((x) => norm(x) === w));
}

export function validateConnections(p: ConnectionsPuzzle): string[] {
  const errors: string[] = [];
  if (!Array.isArray(p.groups) || p.groups.length !== GROUPS) {
    errors.push(`needs exactly ${GROUPS} groups`);
    return errors;
  }
  const seen = new Map<string, number>();
  p.groups.forEach((g, i) => {
    const label = `group ${i + 1}`;
    if (typeof g?.name !== 'string' || !g.name.trim()) errors.push(`${label}: missing name`);
    if (!Array.isArray(g?.words) || g.words.length !== GROUP_SIZE) {
      errors.push(`${label}: needs exactly ${GROUP_SIZE} words`);
      return;
    }
    for (const w of g.words) {
      if (typeof w !== 'string' || !norm(w)) {
        errors.push(`${label}: empty word`);
        continue;
      }
      const n = norm(w);
      if (n.length > MAX_WORD) errors.push(`${label}: "${n}" is ${n.length} characters; tiles fit ${MAX_WORD}`);
      const prev = seen.get(n);
      if (prev !== undefined) errors.push(`"${n}" appears in group ${prev + 1} and group ${i + 1}`);
      else seen.set(n, i);
    }
  });
  return errors;
}
