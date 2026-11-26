#!/usr/bin/env node
/**
 * Content pipeline. Run after `tsc -p tsconfig.json` (imports the compiled core from public/js/core).
 *
 *   node tools/content.mjs validate [--stamp]   check every puzzle (drafts included); --stamp writes late-publish deadlines
 *   node tools/content.mjs build                validate + write server/content.generated.ts (drafts excluded on main)
 *
 * Layout: content/days/<NN>/<game>.json (wend, pinpoint, crossclimb, connections, mini, wordle) and optional
 * day.json ({ "afterword": "..." }).
 * Puzzle files hold the game data plus optional "draft": true, "deadline": "<ISO>", "notes": "...".
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DAY_COUNT, dayEnd, iso, lateDeadline, opensAt } from '../public/js/core/time.js';
import { validateWend, countPlacements } from '../public/js/core/wend.js';
import { validatePinpoint } from '../public/js/core/pinpoint.js';
import { validateCrossclimb } from '../public/js/core/crossclimb.js';
import { validateConnections } from '../public/js/core/connections.js';
import { validateMini } from '../public/js/core/mini.js';
import { validateWordle } from '../public/js/core/wordle.js';
import { ALL_GAMES } from '../public/js/core/types.js';
import { pretty } from './json.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DAYS_DIR = join(ROOT, 'content', 'days');
const OUT = join(ROOT, 'server', 'content.generated.ts');
const META_KEYS = new Set(['draft', 'deadline', 'notes']);

const now = () => (process.env.ADVENT_NOW ? Date.parse(process.env.ADVENT_NOW) : Date.now());
const production = () => process.env.CF_PAGES_BRANCH === 'main' || process.env.ADVENT_PRODUCTION === '1';

function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

const revOf = (data) => createHash('sha256').update(canonical(data)).digest('hex').slice(0, 12);

function splitFile(obj) {
  const data = {};
  const meta = {};
  for (const [k, v] of Object.entries(obj)) (META_KEYS.has(k) ? meta : data)[k] = v;
  return { data, meta };
}

let words = null;
/** public/words.txt, the Wordle guess list (uppercased). */
function wordList() {
  if (!words) {
    const file = join(ROOT, 'public', 'words.txt');
    words = new Set(
      existsSync(file)
        ? readFileSync(file, 'utf8')
            .split('\n')
            .filter((l) => l && !l.startsWith('#'))
            .map((l) => l.trim().toUpperCase())
        : [],
    );
  }
  return words;
}

function validate(game, data) {
  const errors = [];
  const warnings = [];
  let skip = false;
  if (game === 'wend') {
    errors.push(...validateWend(data));
    if (!errors.length) {
      const n = countPlacements(data.grid, data.words.map((w) => w.word), 2);
      if (n > 1) errors.push('grid can be split into these words more than one way; only the authored layout is accepted');
    }
  } else if (game === 'pinpoint') {
    errors.push(...validatePinpoint(data));
  } else if (game === 'crossclimb') {
    errors.push(...validateCrossclimb(data));
  } else if (game === 'connections') {
    errors.push(...validateConnections(data));
  } else if (game === 'mini') {
    errors.push(...validateMini(data));
  } else if (game === 'wordle') {
    errors.push(...validateWordle(data));
    if (!errors.length && !wordList().has(data.answer)) {
      warnings.push(`${data.answer} isn't in public/words.txt; it's still accepted as the answer`);
    }
  } else {
    warnings.push(`${game} is not enabled yet; skipped`);
    skip = true;
  }
  return { errors, warnings, skip };
}

/** Was this puzzle already live (present and not a draft) on origin/main? */
function liveOnMain(path) {
  try {
    const text = execFileSync('git', ['show', `origin/main:${relative(ROOT, path).split('\\').join('/')}`], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
    return !JSON.parse(text).draft;
  } catch {
    return false;
  }
}

function hasOriginMain() {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', 'origin/main'], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function readDays({ includeDrafts, stamp }) {
  const bundle = {};
  const problems = [];
  let count = 0;
  const canStamp = stamp && hasOriginMain();
  if (stamp && !canStamp) console.warn('! no origin/main ref: skipping late-publish deadline stamping');
  if (!existsSync(DAYS_DIR)) return { bundle, problems, count };

  for (const dir of readdirSync(DAYS_DIR).sort()) {
    const n = Number(dir);
    if (!/^\d{2}$/.test(dir) || n < 1 || n > DAY_COUNT) {
      problems.push(`content/days/${dir}: folder must be 01–${DAY_COUNT}`);
      continue;
    }
    const dayPath = join(DAYS_DIR, dir);
    const day = { puzzles: {} };
    const dayJson = join(dayPath, 'day.json');
    if (existsSync(dayJson)) {
      const d = JSON.parse(readFileSync(dayJson, 'utf8'));
      if (d.afterword) day.afterword = String(d.afterword);
    }
    for (const game of ALL_GAMES) {
      const file = join(dayPath, `${game}.json`);
      if (!existsSync(file)) continue;
      const label = `day ${n} ${game}`;
      let obj;
      try {
        obj = JSON.parse(readFileSync(file, 'utf8'));
      } catch (e) {
        problems.push(`${label}: invalid JSON (${e.message})`);
        continue;
      }
      const { data, meta } = splitFile(obj);
      const { errors, warnings, skip } = validate(game, data);
      for (const w of warnings) console.warn(`! ${label}: ${w}`);
      for (const e of errors) problems.push(`${label}: ${e}`);
      if (errors.length || skip) continue;

      if (canStamp && !meta.draft && !meta.deadline && now() >= opensAt(n) && !liveOnMain(file)) {
        meta.deadline = iso(lateDeadline(now()));
        writeFileSync(file, pretty({ ...obj, deadline: meta.deadline }) + '\n');
        console.log(`  stamped ${label}: published after its day opened, deadline ${meta.deadline}`);
      }
      if (meta.draft && !includeDrafts) continue;
      count++;
      day.puzzles[game] = {
        game,
        rev: revOf(data),
        deadline: meta.deadline ? iso(Date.parse(meta.deadline)) : iso(dayEnd(n)),
        data,
      };
    }
    if (Object.keys(day.puzzles).length || day.afterword) bundle[n] = day;
  }
  return { bundle, problems, count };
}

function main() {
  const [cmd, ...flags] = process.argv.slice(2);
  if (cmd === 'validate') {
    const { problems, count } = readDays({ includeDrafts: true, stamp: flags.includes('--stamp') });
    for (const p of problems) console.error(`✗ ${p}`);
    if (problems.length) process.exit(1);
    console.log(`✓ ${count} puzzles valid`);
  } else if (cmd === 'build') {
    const prod = production();
    const { bundle, problems, count } = readDays({ includeDrafts: !prod, stamp: false });
    for (const p of problems) console.error(`✗ ${p}`);
    if (problems.length) process.exit(1);
    mkdirSync(dirname(OUT), { recursive: true });
    // One stamp for the server bundle and the browser code, so an open tab can spot a newer deploy.
    const built = new Date().toISOString();
    const stamp = join(ROOT, 'public', 'js', 'web', 'build.js');
    mkdirSync(dirname(stamp), { recursive: true });
    writeFileSync(stamp, `// Written by tools/content.mjs build.\nexport const BUILD = ${JSON.stringify(built)};\n`);
    writeIndex(built);
    writeFileSync(
      OUT,
      `// Generated by tools/content.mjs — do not edit.\n` +
        `import type { ContentBundle } from '../src/core/types.ts';\n\n` +
        `export const BUILT_AT = ${JSON.stringify(built)};\n` +
        `export const INCLUDES_DRAFTS = ${!prod};\n` +
        `export const CONTENT: ContentBundle = ${JSON.stringify(bundle, null, 2)};\n`,
    );
    console.log(`✓ bundled ${count} puzzles${prod ? '' : ' (drafts included)'} → ${relative(ROOT, OUT)}`);
  } else {
    console.error('usage: node tools/content.mjs validate [--stamp] | build');
    process.exit(2);
  }
}

/**
 * public/index.html from src/index.html, with every script and the stylesheet at a per-build URL
 * (`?v=<build>`), via an import map for the modules. The useless.blog zone gives /js and /styles.css a
 * 4-hour browser cache that overrides _headers; the page itself is always revalidated, so new URLs per
 * build are what make a reload pick up new code.
 */
function writeIndex(built) {
  const v = encodeURIComponent(built);
  const jsDir = join(ROOT, 'public', 'js');
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : []));
  const imports = {};
  for (const file of existsSync(jsDir) ? walk(jsDir).sort() : []) {
    const url = '/js/' + relative(jsDir, file).split('\\').join('/');
    imports[url] = `${url}?v=${v}`;
  }
  const map = `<script type="importmap">${JSON.stringify({ imports })}</script>`;
  const html = readFileSync(join(ROOT, 'src', 'index.html'), 'utf8').replaceAll('%BUILD%', v).replace('<!-- importmap -->', map);
  writeFileSync(join(ROOT, 'public', 'index.html'), html);
}

main();
