#!/usr/bin/env node
/**
 * Lay words into a Wend grid shape and keep only layouts with exactly one placement.
 *
 *   npm run layout -- --shape ".....|.#...|....." --words maple,cedar,oak,pine [--seed 7] [--tries 50] [--theme "Trees"]
 *
 * Shape: rows separated by |, "." open, "#" wall. Open cells must equal the total letters.
 * Prints wend.json content to stdout.
 */
import { layout, countPlacements, validateWend } from '../public/js/core/wend.js';
import { mulberry32 } from '../public/js/core/rand.js';
import { pretty } from './json.mjs';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const shape = (arg('shape') ?? '').split('|').filter(Boolean);
const words = (arg('words') ?? '').split(',').map((w) => w.trim()).filter(Boolean);
const seed = Number(arg('seed', Date.now() % 1e6));
const tries = Number(arg('tries', 50));
const theme = arg('theme');

if (!shape.length || !words.length) {
  console.error('usage: --shape ".....|.#...|....." --words a,b,c [--seed N] [--tries N] [--theme T]');
  process.exit(2);
}
const open = shape.join('').split('').filter((c) => c === '.').length;
const letters = words.join('').length;
if (open !== letters) {
  console.error(`shape has ${open} open cells but the words have ${letters} letters`);
  process.exit(1);
}

for (let t = 0; t < tries; t++) {
  const p = layout(shape, words, mulberry32(seed + t));
  if (!p) continue;
  if (validateWend(p).length) continue;
  if (countPlacements(p.grid, p.words.map((w) => w.word), 2) !== 1) continue;
  if (theme) p.theme = theme;
  console.error(`found a unique layout on try ${t + 1} (seed ${seed + t})`);
  console.log(pretty({ draft: true, ...p }));
  process.exit(0);
}
console.error(`no unique layout in ${tries} tries; change the shape, the words or --seed`);
process.exit(1);
