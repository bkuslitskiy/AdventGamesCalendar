#!/usr/bin/env node
/**
 * Browser play-through of Day 1: gate, calendar, every published game solved through the UI (with a
 * deliberate mistake in each), afterword, server-side progress, guest isolation, mid-puzzle restore,
 * and small-phone layout. Reads the puzzles from content/days/01, so it works with mocks or real ones.
 *
 *   npm run e2e                 (needs Playwright once: npm i --no-save playwright && npx playwright install chromium)
 *   SHOTS=.dev/shots npm run e2e   also saves screenshots
 *
 * Starts its own dev server on an in-memory database, with the clock frozen before Dec 1 and early access on.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('e2e needs Playwright: npm i --no-save playwright && npx playwright install chromium');
  process.exit(2);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Which day to play through: E2E_DAY=4 npm run e2e. Defaults to Day 1. */
const N = Number(process.env.E2E_DAY ?? 1);
const DAY = join(ROOT, 'content', 'days', String(N).padStart(2, '0'));
const PORT = Number(process.env.E2E_PORT ?? 8799);
const BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.SHOTS ? join(ROOT, process.env.SHOTS) : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const has = (g) => existsSync(join(DAY, `${g}.json`));
const load = (g) => JSON.parse(readFileSync(join(DAY, `${g}.json`), 'utf8'));
const ORDER = ['wend', 'pinpoint', 'crossclimb', 'connections', 'mini', 'wordle', 'hashtag'];
const hash = await import(new URL('../public/js/core/hashtag.js', import.meta.url));
const games = ORDER.filter(has);

// ---- tiny runner ----
const results = [];
const ok = (cond, msg) => {
  results.push(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) process.exitCode = 1;
};

// ---- dev server ----
const server = spawn(process.execPath, [join(ROOT, 'tools', 'dev-server.mjs')], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), DB_FILE: ':memory:', ADVENT_NOW: '2026-11-28T17:00:00Z', ADVENT_EARLY_ACCESS: '1', NTFY_URL: '', ADVENT_FAKE_AI: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));
for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${BASE}/api/state`)).ok) break;
  } catch {
    /* not up yet */
  }
  if (i > 100) {
    console.error(serverLog);
    throw new Error('dev server did not start (run `npm run build && tsc -p tsconfig.server.json` first)');
  }
  await new Promise((r) => setTimeout(r, 100));
}

const browser = await chromium.launch();
const errors = [];
async function phone(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/favicon|fonts\./.test(m.text()) && errors.push(m.text()));
  return page;
}

try {
  const page = await phone();
  const shot = (name) => SHOTS && page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
  const solvedCard = async (game) => {
    await page.waitForSelector('.result h2', { timeout: 5000 });
    const t = (await page.textContent('.result')).replace(/\s+/g, ' ').trim();
    ok(/Solved on the day/.test(t), `${game}: solved on the day — ${t}`);
    await shot(`${game}-solved`);
  };

  // ---- Gate, calendar, day ----
  await page.goto(`${BASE}/`);
  await page.getByRole('button', { name: 'Yes' }).click();
  await page.waitForSelector('.month');
  ok(/Early access/.test(await page.textContent('.lede')), 'calendar: early-access message before Dec 1');
  ok((await page.locator('a.door').count()) === 31, 'calendar: every day is open during early access');
  const assets = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((u) => /\/js\/|styles\.css/.test(u)));
  ok(assets.length > 10 && assets.every((u) => u.includes('?v=')), `cache: every module and the stylesheet load at a per-build URL (${assets.length})`);
  ok((await page.locator(`a.door[href="#/day/${N}"] .pip`).count()) === games.length, `calendar: day ${N} has ${games.length} pips`);
  await shot('calendar');
  await page.click(`a.door[href="#/day/${N}"]`);
  await page.waitForSelector('.games');
  ok((await page.locator('.games a .name').count()) === games.length, `day ${N} lists ${games.length} playable games`);

  // ---- Wend: drag each word along its path ----
  if (has('wend')) {
    const p = load('wend');
    await page.goto(`${BASE}/#/day/${N}/wend`);
    await page.waitForSelector('.wend');
    const b = await page.locator('.wend').boundingBox();
    const at = ([r, c]) => [b.x + (c + 0.5) * (b.width / p.grid[0].length), b.y + (r + 0.5) * (b.height / p.grid.length)];
    for (const w of p.words) {
      await page.mouse.move(...at(w.path[0]));
      await page.mouse.down();
      for (const cell of w.path.slice(1)) await page.mouse.move(...at(cell), { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(60);
    }
    await solvedCard('wend');
  }

  // ---- Pinpoint: one miss, then the answer ----
  if (has('pinpoint')) {
    const p = load('pinpoint');
    await page.goto(`${BASE}/#/day/${N}/pinpoint`);
    await page.fill('input[name=guess]', 'zzz nothing like it');
    await page.keyboard.press('Enter');
    await page.locator('.clues li:not(.hidden)').nth(1).waitFor({ timeout: 5000 });
    ok((await page.locator('.clues li:not(.hidden)').count()) === 2, 'pinpoint: a miss reveals the next clue (after the AI judge says no)');
    await page.fill('input[name=guess]', p.answer);
    await page.keyboard.press('Enter');
    await solvedCard('pinpoint');
  }

  // ---- Crossclimb: a miss, fill, arrange, ends — all on the on-screen keyboard ----
  if (has('crossclimb')) {
    const p = load('crossclimb');
    await page.goto(`${BASE}/#/day/${N}/crossclimb`);
    await page.waitForSelector('.ladder');
    ok((await page.locator('.ladder input, .dock input').count()) === 0, "crossclimb: no text inputs, so the phone's keyboard never opens");
    const first = await page.locator('.rung.active').getAttribute('data-row');
    ok((await page.textContent('.dock .clue')) === p.rungs[Number(first)].clue, 'crossclimb: the first open rung starts active, with its clue');
    const onScreen = async (sel) => {
      const b = await page.locator(sel).boundingBox();
      return !!b && b.y >= 0 && b.y + b.height <= page.viewportSize().height;
    };
    ok((await onScreen('.dock .clue')) && (await onScreen('.key[data-key="Q"]')), 'crossclimb: the clue and keys are on screen');
    const clear = await page.evaluate(() => document.querySelector('.rung.active').getBoundingClientRect().bottom <= document.querySelector('.dock').getBoundingClientRect().top + 1);
    ok(clear, 'crossclimb: the active row is in view above the dock');
    for (let k = 0; k < p.length; k++) await page.click('.key[data-key="Q"]');
    ok((await page.textContent('.dock .feedback')).includes('Not that one'), 'crossclimb: a wrong word typed on the on-screen keys is a miss');
    for (let i = 0; i < p.rungs.length; i++) {
      const sel = `.rung.typing[data-row="${i}"]`;
      if (!(await page.locator(sel).count())) continue;
      await page.click(sel);
      ok((await page.textContent('.dock .clue')) === p.rungs[i].clue, `crossclimb: tapping rung ${i} shows its clue`);
      await page.keyboard.type(p.rungs[i].word);
    }
    if (await page.locator('.rung.tappable').count()) ok(await page.locator('.dock .kb').isHidden(), 'crossclimb: the keys hide while arranging');
    else ok(await page.locator('.dock .kb').isVisible(), 'crossclimb: the shuffle was already a ladder, so straight to the ends with keys up');
    const words = async () => (await page.locator('.ladder > .rung').allTextContents()).slice(1, -1).map((t) => t.replace(/\s+/g, ''));
    const target = p.rungs.map((r) => r.word);
    for (let pos = 0; pos < target.length; pos++) {
      const at = (await words()).indexOf(target[pos]);
      if (at !== pos) {
        await page.locator('.ladder > .rung').nth(pos + 1).click();
        await page.locator('.ladder > .rung').nth(at + 1).click();
      }
    }
    ok((await page.locator('.rung.active').getAttribute('data-row')) === 'top', 'crossclimb: the ends start with the top row active');
    ok((await onScreen('.dock .clue')) && (await page.textContent('.dock .clue')).includes(p.ends.clue), 'crossclimb: the ends clue is on screen');
    await page.keyboard.type(p.ends.top);
    if (await page.locator('.rung.typing[data-row="bottom"]').count()) {
      await page.click('.rung.typing[data-row="bottom"]');
      await page.keyboard.type(p.ends.bottom);
    }
    await solvedCard('crossclimb');
  }

  // ---- Connections: one away, a repeat, then every group ----
  if (has('connections')) {
    const p = load('connections');
    const up = (w) => w.trim().toUpperCase().replace(/\s+/g, ' ');
    const tap = (w) => page.locator('.conn-tile', { hasText: new RegExp(`^${up(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).click();
    await page.goto(`${BASE}/#/day/${N}/connections`);
    await page.waitForSelector('.conn-grid');
    for (const w of [...p.groups[0].words.slice(0, 3), p.groups[1].words[0]]) await tap(w);
    await page.getByRole('button', { name: 'Submit' }).click();
    ok((await page.textContent('.feedback')).includes('One away'), 'connections: three of a group is "one away"');
    await page.getByRole('button', { name: 'Submit' }).click();
    ok((await page.textContent('.feedback')).includes('tried those'), 'connections: a repeated guess is caught and not counted');
    ok((await page.textContent('.conn-mistakes')).includes('1 mistake'), 'connections: one mistake counted');
    await page.getByRole('button', { name: 'Deselect all' }).click();
    await page.getByRole('button', { name: 'Shuffle' }).click();
    for (const g of p.groups) {
      for (const w of g.words) await tap(w);
      await page.getByRole('button', { name: 'Submit' }).click();
    }
    await solvedCard('connections');
    ok((await page.locator('.conn-recap-row').count()) === p.groups.length + 1, 'connections: recap shows every recorded guess');
  }

  // ---- Mini: type the first entry on the on-screen keys, fill the rest square by square, last one wrong ----
  if (has('mini')) {
    const p = load('mini');
    await page.goto(`${BASE}/#/day/${N}/mini`);
    await page.waitForSelector('.mini');
    const cell = (r, c) => page.locator(`.mcell[data-r="${r}"][data-c="${c}"]`);
    const whites = [];
    for (let r = 0; r < p.grid.length; r++) for (let c = 0; c < p.grid[r].length; c++) if (p.grid[r][c] !== '#') whites.push([r, c]);
    // First across entry, typed in one go: checks the cursor advances along the word.
    const [r0, c0] = whites[0];
    let first = [];
    for (let c = c0; p.grid[r0][c] && p.grid[r0][c] !== '#'; c++) first.push([r0, c]);
    if (first.length < 2) first = [];
    if (first.length) {
      await cell(r0, c0).click();
      if (!(await page.textContent('.mini-cluetext b')).endsWith('A')) await cell(r0, c0).click();
      for (const [y, x] of first) await page.click(`.key[data-key="${p.grid[y][x]}"]`);
      ok((await cell(r0, c0).textContent()).includes(p.grid[r0][c0]), 'mini: on-screen keys type into the grid');
    }
    const rest = whites.filter(([y, x]) => !first.some(([a, b]) => a === y && b === x));
    for (const [i, [y, x]] of rest.entries()) {
      const right = p.grid[y][x];
      await cell(y, x).click();
      await page.keyboard.press(i === rest.length - 1 ? (right === 'Q' ? 'Z' : 'Q') : right);
    }
    ok((await page.textContent('.feedback')).includes('not right yet'), 'mini: a full but wrong grid is flagged');
    await shot('mini-wrong');
    const [ly, lx] = rest.at(-1);
    await cell(ly, lx).click();
    await page.keyboard.press('Backspace');
    await page.keyboard.press(p.grid[ly][lx]);
    await solvedCard('mini');
  }

  // ---- Wordle: unknown word, a real wrong guess, then the answer on the on-screen keys ----
  if (has('wordle')) {
    const p = load('wordle');
    const L = p.answer.length;
    const list = readFileSync(join(ROOT, 'public', 'words.txt'), 'utf8').split('\n').filter((w) => w && !w.startsWith('#'));
    const wrong = list.find((w) => w.length === L && w.toUpperCase() !== p.answer).toUpperCase();
    await page.goto(`${BASE}/#/day/${N}/wordle`);
    await page.waitForSelector('.wordle');
    await page.keyboard.type('Q'.repeat(L));
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.feedback')?.textContent?.includes('word list'));
    ok(true, 'wordle: an unknown word is rejected without using a row');
    for (let i = 0; i < L; i++) await page.keyboard.press('Backspace');
    await page.keyboard.type(wrong);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    ok((await page.locator('.wrow').first().locator('.wtile.hit, .wtile.near, .wtile.miss').count()) === L, `wordle: ${wrong} is scored letter by letter`);
    for (const ch of p.answer) await page.click(`.key[data-key="${ch}"]`);
    await page.click('.key[data-key="Enter"]');
    await solvedCard('wordle');
  }

  // ---- Hashtag: a locked green, one wasted swap by dragging, then the fewest swaps by tapping ----
  if (has('hashtag')) {
    const p = load('hashtag');
    const target = hash.solution(p);
    let tiles = hash.startTiles(p);
    const sq = (i) => page.locator(`.htile[data-i="${i}"]`);
    await page.goto(`${BASE}/#/day/${N}/hashtag`);
    await page.waitForSelector('.hashtag');
    ok((await page.locator('.htile').count()) === 16, 'hashtag: 16 letter squares');
    ok((await page.textContent('.hash-count')).includes(`${hash.PAR} of ${hash.PAR} swaps left`), 'hashtag: starts with every swap left');
    const startMarks = hash.marks(target, tiles);
    ok((await page.locator('.htile.hit').count()) === startMarks.filter((m) => m === 'hit').length, 'hashtag: start greens match the rules');
    const open = startMarks.map((m, i) => (m === 'hit' ? -1 : i)).filter((i) => i >= 0);
    const pair = open.flatMap((a) => open.map((b) => [a, b])).find(([a, b]) => a < b && tiles[a] !== tiles[b] && hash.wasted(target, tiles, hash.swap(tiles, a, b)));
    if (pair) {
      const [a, b] = pair;
      const ba = await sq(a).boundingBox();
      const bb = await sq(b).boundingBox();
      await page.mouse.move(ba.x + ba.width / 2, ba.y + ba.height / 2);
      await page.mouse.down();
      await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 8 });
      await page.mouse.up();
      tiles = hash.swap(tiles, a, b);
      ok((await sq(a).textContent()) === tiles[a] && (await sq(b).textContent()) === tiles[b], 'hashtag: dragging one letter onto another swaps them');
      ok((await page.textContent('.hash-count')).includes(`${hash.PAR - 1} of ${hash.PAR}`), 'hashtag: the swap is counted');
    }
    for (const [a, b] of hash.solve(target, tiles)) {
      await sq(a).click();
      await sq(b).click();
      tiles = hash.swap(tiles, a, b);
    }
    await solvedCard('hashtag');
    const best = hash.fewestSwaps(target, hash.startTiles(p));
    const detail = await page.textContent('.result p');
    ok(pair ? detail.includes(`the fewest is ${best}`) : detail.includes('the fewest possible'), `hashtag: result compares with the fewest swaps — ${detail}`);
    ok((await page.locator('.htile.hit').count()) === 16, 'hashtag: solved view is all green');
    if (pair) {
      const rec = (await page.evaluate(() => fetch('/api/progress').then((r) => r.json()))).solves.find((s) => s.game === 'hashtag');
      ok(rec?.payload.stats.attempts >= 1, `hashtag: the wasted swap is logged as a miss (${rec?.payload.stats.attempts})`);
    }
  }

  // ---- Day done, progress on the server, solved views after reload ----
  await page.goto(`${BASE}/#/day/${N}`);
  await page.waitForSelector('.games');
  ok((await page.locator('.games .state.ontime').count()) === games.length, `day ${N}: all ${games.length} games marked solved`);
  if (existsSync(join(DAY, 'day.json')) && load('day').afterword) ok((await page.locator('.afterword').count()) === 1, `day ${N}: afterword appears`);
  await page.goto(`${BASE}/#/`);
  await page.waitForSelector('.month');
  ok((await page.locator(`a.door[href="#/day/${N}"].ontime`).count()) === 1, `calendar: day ${N} shows solved on the day`);
  const progress = await page.evaluate(() => fetch('/api/progress').then((r) => r.json()));
  ok(progress.solves.length === games.length, `server log holds ${progress.solves.length} solves for babe`);
  await page.reload();
  for (const g of games) {
    await page.goto(`${BASE}/#/day/${N}/${g}`);
    await page.waitForSelector('.result');
  }
  ok(true, 'every game reopens in its solved view after a reload');

  // ---- Guest: own progress, server untouched, mid-puzzle state restored ----
  const guest = await phone();
  await guest.goto(`${BASE}/`);
  await guest.getByRole('button', { name: 'No' }).click();
  await guest.waitForSelector('.month');
  ok((await guest.locator('a.door.ontime').count()) === 0, 'guest: starts with nothing solved');
  if (has('wordle')) {
    await guest.goto(`${BASE}/#/day/${N}/wordle`);
    await guest.waitForSelector('.wordle');
    await guest.keyboard.type(load('wordle').answer);
    await guest.keyboard.press('Enter');
    await guest.waitForSelector('.result');
    const after = await guest.evaluate(() => fetch('/api/progress').then((r) => r.json()));
    ok(after.solves.length === games.length, "guest: a solve doesn't touch babe's log");
  }
  if (has('connections')) {
    await guest.goto(`${BASE}/#/day/${N}/connections`);
    await guest.waitForSelector('.conn-grid');
    await guest.locator('.conn-tile').first().click();
    await guest.goto(`${BASE}/#/day/${N}`);
    await guest.goto(`${BASE}/#/day/${N}/connections`);
    await guest.waitForSelector('.conn-grid');
    ok((await guest.locator('.conn-tile.on').count()) === 1, 'guest: mid-puzzle state survives leaving the page');
  }

  if (has('hashtag')) {
    await guest.goto(`${BASE}/#/day/${N}/hashtag`);
    await guest.waitForSelector('.hashtag');
    await guest.locator('.htile:not(.hit)').first().click();
    await guest.goto(`${BASE}/#/day/${N}`);
    await guest.goto(`${BASE}/#/day/${N}/hashtag`);
    await guest.waitForSelector('.hashtag');
    ok((await guest.locator('.htile.on').count()) === 1, 'hashtag: a picked letter survives leaving the page');
  }

  // ---- Pinpoint's ending: offer, two more, offer, two more, cut off (as guest) ----
  if (has('pinpoint')) {
    const p = load('pinpoint');
    const miss = async (pg, i) => {
      await pg.fill('input[name=guess]', `zzz nothing ${i}`);
      await pg.keyboard.press('Enter');
      await pg.waitForFunction((n) => document.querySelectorAll('.misses s').length >= n || !!document.querySelector('.result'), i);
    };
    await guest.goto(`${BASE}/#/day/${N}/pinpoint`);
    for (let i = 1; i <= 5; i++) await miss(guest, i);
    ok((await guest.locator('.offer').count()) === 1 && (await guest.locator('form.guess').count()) === 0, 'pinpoint: a miss on the last clue offers the answer');
    await guest.reload();
    await guest.waitForSelector('.offer');
    ok(true, 'pinpoint: the offer survives a reload');
    await guest.getByRole('button', { name: 'Two more guesses' }).click();
    ok(/Two more guesses, then I’ll ask again/.test(await guest.textContent('.feedback')), 'pinpoint: declining gives two more guesses');
    await miss(guest, 6);
    ok((await guest.locator('form.guess').count()) === 1, 'pinpoint: one extra miss keeps guessing');
    await miss(guest, 7);
    ok(/cut off/.test(await guest.textContent('.offer')), 'pinpoint: the second offer warns about the cut-off');
    await guest.getByRole('button', { name: 'Two more guesses' }).click();
    await miss(guest, 8);
    ok(/Last guess/.test(await guest.textContent('.feedback')), 'pinpoint: the ninth guess is flagged as the last');
    await miss(guest, 9);
    await guest.waitForSelector('.result h2');
    const t = (await guest.textContent('.result')).replace(/\s+/g, ' ');
    ok(/You’re cut off\./.test(t) && t.includes(`The answer is ‘${p.answer}’.`), `pinpoint: cut off with the answer — ${t}`);
    ok((await guest.locator('.misses s').count()) === 9, 'pinpoint: the cut-off board lists all nine misses');
    await guest.goto(`${BASE}/#/day/${N}`);
    await guest.waitForSelector('.games');
    ok(/Revealed/.test(await guest.textContent(`.games a[href="#/day/${N}/pinpoint"] .state`)), 'pinpoint: the day page says Revealed');

    const asker = await phone({ viewport: { width: 320, height: 640 } });
    await asker.goto(`${BASE}/`);
    await asker.getByRole('button', { name: 'No' }).click();
    await asker.waitForSelector('.month');
    await asker.goto(`${BASE}/#/day/${N}/pinpoint`);
    for (let i = 1; i <= 5; i++) await miss(asker, i);
    ok(await asker.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '320px: the pinpoint offer fits');
    await asker.getByRole('button', { name: 'Show me' }).click();
    await asker.waitForSelector('.result h2');
    ok(/Answer revealed/.test(await asker.textContent('.result h2')), 'pinpoint: asking shows the answer');
    const progress = await asker.evaluate(() => fetch('/api/progress').then((r) => r.json()));
    ok(progress.solves.length === games.length, "pinpoint: a guest's revealed answer doesn't touch babe's log");

    // ---- AI judge (the dev server's fake says YES only to guesses containing "fakeyes") ----
    const judgeApi = await (async () => {
      const post = (body) => fetch(`${BASE}/api/judge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const health = await fetch(`${BASE}/api/judge`).then((r) => r.json());
      const words = await post({ day: N, guess: p.answer }).then((r) => r.json());
      const ai = await post({ day: N, guess: 'fakeyes kit' }).then((r) => r.json());
      const no = await post({ day: N, guess: 'zzz' }).then((r) => r.json());
      const long = (await post({ day: N, guess: 'x'.repeat(61) })).status;
      const missing = (await post({ day: 9, guess: 'tools' })).status;
      const raw = await post({ day: N, guess: 'fakeyes kit' }).then((r) => r.text());
      return { health, words, ai, no, long, missing, raw };
    })();
    ok(judgeApi.health.ai === true, 'judge: GET reports the AI binding');
    ok(judgeApi.words.verdict === 'correct' && judgeApi.words.by === 'words', 'judge: the word matcher answers first, no AI call');
    ok(judgeApi.ai.verdict === 'correct' && judgeApi.ai.by === 'ai', 'judge: AI can accept what words miss');
    ok(judgeApi.no.verdict === 'wrong', 'judge: AI can say no');
    ok(judgeApi.long === 400 && judgeApi.missing === 404, 'judge: long guesses and missing puzzles are refused');
    ok(!judgeApi.raw.includes(p.answer), "judge: the reply never carries the answer");

    const aiGuest = await phone();
    await aiGuest.goto(`${BASE}/`);
    await aiGuest.getByRole('button', { name: 'No' }).click();
    await aiGuest.waitForSelector('.month');
    await aiGuest.goto(`${BASE}/#/day/${N}/pinpoint`);
    await miss(aiGuest, 1);
    await aiGuest.fill('input[name=guess]', 'fakeyes handyman kit');
    await aiGuest.keyboard.press('Enter');
    await aiGuest.waitForSelector('.result h2');
    ok(/Solved on the day/.test(await aiGuest.textContent('.result h2')), 'pinpoint: an AI-accepted guess solves the puzzle');
    const board = await aiGuest.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const v = localStorage.getItem(localStorage.key(i));
        if (v && v.includes('aiAccepted')) return v;
      }
      return '';
    });
    ok(/"aiAccepted":true/.test(board), 'pinpoint: the solve records that the AI accepted it');
  }

  // ---- A newer deploy reloads an open tab, once ----
  {
    const tab = await phone();
    await tab.goto(`${BASE}/`);
    await tab.getByRole('button', { name: 'No' }).click();
    await tab.waitForSelector('.month');
    await tab.goto(`${BASE}/#/day/${N}`);
    await tab.waitForSelector('.games');
    ok(!(await tab.evaluate(() => sessionStorage.getItem('advent.reloadedFor'))), 'update: the current deploy never reloads');
    await tab.evaluate(() => (window.__sameLoad = true));
    await tab.route('**/api/state*', async (r) => {
      const res = await r.fetch();
      await r.fulfill({ response: res, json: { ...(await res.json()), build: 'newer-deploy' } });
    });
    await tab.click('a.back');
    await tab.waitForFunction(() => !window.__sameLoad, null, { timeout: 5000 });
    await tab.waitForSelector('.month');
    ok((await tab.evaluate(() => sessionStorage.getItem('advent.reloadedFor'))) === 'newer-deploy', 'update: a newer deploy reloads the open tab');
    await tab.evaluate(() => (window.__sameLoad = true));
    await tab.goto(`${BASE}/#/day/${N}`);
    await tab.waitForSelector('.games');
    await tab.click('a.back');
    await tab.waitForSelector('.month');
    await tab.waitForTimeout(300);
    ok(await tab.evaluate(() => window.__sameLoad === true), 'update: only once per deploy, so a stale cache can\'t loop');
    await tab.unroute('**/api/state*');
  }

  // ---- Small phone layout ----
  const small = await phone({ viewport: { width: 320, height: 640 } });
  await small.goto(`${BASE}/`);
  await small.getByRole('button', { name: 'No' }).click();
  await small.waitForSelector('.month');
  ok(!(await small.evaluate(() => [...document.querySelectorAll('.door')].some((d) => d.scrollWidth > d.clientWidth + 1 || d.scrollHeight > d.clientHeight + 1))), '320px: calendar doors fit');
  if (has('connections')) {
    await small.goto(`${BASE}/#/day/${N}/connections`);
    await small.waitForSelector('.conn-grid');
    const broken = await small.evaluate(() =>
      [...document.querySelectorAll('.conn-tile')].filter((t) => {
        const r = document.createRange();
        r.selectNodeContents(t);
        const lines = new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size;
        return t.scrollWidth > t.clientWidth + 1 || lines > t.textContent.split(' ').length;
      }).map((t) => t.textContent),
    );
    ok(broken.length === 0, `320px: connections words fit their tiles${broken.length ? ` (not: ${broken.join(', ')})` : ''}`);
  }
  for (const g of ['wordle', 'mini', 'hashtag', 'crossclimb'].filter(has)) {
    await small.goto(`${BASE}/#/day/${N}/${g}`);
    await small.waitForSelector({ wordle: '.wordle', mini: '.mini', hashtag: '.hashtag', crossclimb: '.ladder' }[g]);
    ok(await small.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `320px: ${g} fits the screen`);
  }

  // ---- Docks: keys and buttons pinned to the bottom, the board in view above them ----
  // 360×600 is a Galaxy S22 in Samsung Internet (bars and 3-button navigation showing).
  const DOCKED = {
    crossclimb: { on: ['.dock .clue', '.key[data-key="Q"]', '.key[data-key="M"]'], above: '.rung.active' },
    wordle: { on: ['.key[data-key="Q"]', '.key[data-key="Enter"]', '.key[data-key="Backspace"]'], above: '.wordle' },
    mini: { on: ['.dock .mini-cluetext', '.key[data-key="Q"]', '.key[data-key="M"]'], above: '.mini' },
    connections: { on: ['.dock .conn-controls .btn:last-child'], above: '.conn-grid' },
  };
  for (const [label, viewport] of [['320×640', { width: 320, height: 640 }], ['Galaxy S22 (360×600)', { width: 360, height: 600 }]]) {
    const ph = viewport.width === 320 ? small : await phone({ viewport, isMobile: true, hasTouch: true });
    if (ph !== small) {
      await ph.goto(`${BASE}/`);
      await ph.getByRole('button', { name: 'No' }).click();
      await ph.waitForSelector('.month');
    }
    for (const [g, want] of Object.entries(DOCKED).filter(([g]) => has(g))) {
      await ph.goto(`${BASE}/#/day/${N}/${g}`);
      await ph.waitForSelector('.dock');
      await ph.waitForTimeout(150);
      const seen = await ph.evaluate((sels) => sels.every((sel) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return !!r && r.top >= 0 && r.bottom <= innerHeight + 1; }), want.on);
      ok(seen, `${label}: the ${g} ${g === 'connections' ? 'Submit button is' : 'keys are'} on screen without scrolling`);
      const clear = await ph.evaluate((sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return b.top >= -1 && b.bottom <= document.querySelector('.dock').getBoundingClientRect().top + 1; }, want.above);
      ok(clear, `${label}: the whole ${g === 'crossclimb' ? 'active row' : g === 'connections' ? 'set of tiles' : 'grid'} is in view above the dock`);
      const flush = async () => ph.evaluate(() => Math.abs(document.querySelector('.dock').getBoundingClientRect().bottom - innerHeight) <= 1);
      const pinned = await flush();
      await ph.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await ph.waitForTimeout(100);
      ok(pinned && (await flush()), `${label}: the ${g} dock sits on the bottom edge, on open and scrolled to the end`);
    }
  }

  ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} catch (e) {
  ok(false, `crashed: ${e.message}`);
} finally {
  await browser.close();
  server.kill();
}

console.log(results.join('\n'));
console.log(`\n${results.filter((r) => r.startsWith('ok')).length} ok, ${results.filter((r) => r.startsWith('FAIL')).length} failed`);
