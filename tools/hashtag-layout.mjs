#!/usr/bin/env node
/**
 * Scramble a Hashtag, or find words that fit one.
 *
 *   npm run hashtag -- --across jolly,boxes --down cocoa,elves [--swaps 8] [--greens 4] [--seed N] [--theme "…"]
 *   npm run hashtag -- --across jolly,? --down ?,elves          (find fills from public/words.txt)
 *
 * The across words are rows 2 and 4, the down words columns 2 and 4, so they cross at the 2nd and 4th
 * letters. --greens squares start in place, and the scramble needs exactly --swaps swaps at best (par is
 * 12). Prints hashtag.json content (as a draft) to stdout and a picture of the board to stderr.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAR, SQUARES, fewestSwaps, marks, scramble, solution, toGrid, validateHashtag } from '../public/js/core/hashtag.js';
import { hashString, mulberry32, shuffled } from '../public/js/core/rand.js';
import { pretty } from './json.mjs';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const list = (s) => (s ?? '').split(',').map((w) => w.trim().toUpperCase());

const across = list(arg('across'));
const down = list(arg('down'));
if (across.length !== 2 || down.length !== 2) {
  console.error('usage: --across WORD,WORD --down WORD,WORD [--swaps 8] [--greens 4] [--seed N] [--theme T]\n       use ? for a word to find fills');
  process.exit(2);
}
const words = [...across, ...down];

// ---- Find mode: fill the ? slots from the word list ----
if (words.includes('?')) {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  // Shuffled (by --seed) so the first fills aren't all from the start of the alphabet.
  const dict = shuffled(
    readFileSync(join(ROOT, 'public', 'words.txt'), 'utf8')
      .split('\n')
      .map((l) => l.trim().toUpperCase())
      .filter((l) => /^[A-Z]{5}$/.test(l)),
    Number(arg('seed', 1)),
  );
  const limit = Number(arg('limit', 40));
  // Which letter of which other word each slot's letters must match: [slot, pos, otherSlot, otherPos].
  const CROSS = [
    [0, 1, 2, 1],
    [0, 3, 3, 1],
    [1, 1, 2, 3],
    [1, 3, 3, 3],
  ];
  const fits = (slots) =>
    CROSS.every(([a, i, b, j]) => slots[a] === '?' || slots[b] === '?' || slots[a][i] === slots[b][j]) &&
    new Set(slots.filter((w) => w !== '?')).size === slots.filter((w) => w !== '?').length;
  if (!fits(words)) {
    console.error('the words given already clash where they cross');
    process.exit(1);
  }
  const found = [];
  const fill = (slots) => {
    if (found.length >= limit) return;
    const k = slots.indexOf('?');
    if (k < 0) {
      found.push(slots.slice());
      return;
    }
    for (const w of dict) {
      slots[k] = w;
      if (fits(slots)) fill(slots);
      slots[k] = '?';
      if (found.length >= limit) return;
    }
  };
  fill(words.slice());
  if (!found.length) {
    console.error('no fills in public/words.txt');
    process.exit(1);
  }
  for (const f of found) console.log(`across ${f[0]}, ${f[1]}   down ${f[2]}, ${f[3]}`);
  if (found.length >= limit) console.error(`(first ${limit}; --limit N for more)`);
  process.exit(0);
}

// ---- Scramble mode ----
const greens = Number(arg('greens', 4));
const swaps = Number(arg('swaps', 8));
const tries = Number(arg('tries', 2000));
const theme = arg('theme');
const base = { across, down, start: toGrid(solution({ across, down })) };
const wordErrors = validateHashtag(base).filter((e) => e !== 'start is already solved');
if (wordErrors.length) {
  for (const e of wordErrors) console.error(`✗ ${e}`);
  process.exit(1);
}
const moving = SQUARES.length - greens;
if (!(greens >= 0 && moving >= 2 && swaps >= Math.ceil(moving / 2) && swaps <= Math.min(moving - 1, PAR))) {
  console.error(`with ${greens} greens, --swaps must be ${Math.ceil(moving / 2)}–${Math.min(moving - 1, PAR)}`);
  process.exit(1);
}

const target = solution(base);
const seed = Number(arg('seed', hashString(words.join(','))));
for (let t = 0; t < tries; t++) {
  const tiles = scramble(target, mulberry32(seed + t), { greens, swaps });
  if (!tiles) continue;
  const p = { draft: true, across, down, start: toGrid(tiles), ...(theme ? { theme } : {}) };
  const m = marks(target, tiles);
  const shade = { hit: 'G', near: 'y', miss: '.' };
  const pic = toGrid(tiles).map((row, r) =>
    [...row]
      .map((ch, c) => {
        const i = SQUARES.findIndex(([y, x]) => y === r && x === c);
        return i < 0 ? '   ' : ` ${ch}${shade[m[i]]}`;
      })
      .join(''),
  );
  console.error(pic.join('\n'));
  console.error(`(G green, y yellow, . grey) ${greens} start green, ${fewestSwaps(target, tiles)} swaps at best, par ${PAR}. Seed ${seed + t}.`);
  // The word pairs on one line each; the start keeps one row per line, so it reads as the board.
  console.log(pretty(p).replace(/"(across|down)": \[\s+("[A-Z]+"),\s+("[A-Z]+")\s+\]/g, '"$1": [$2, $3]'));
  process.exit(0);
}
console.error(`no scramble in ${tries} tries. Repeated letters make high --swaps hard to hit; try fewer swaps or greens, or --seed`);
process.exit(1);
