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
const ORDER = ['wend', 'pinpoint', 'crossclimb', 'connections', 'mini', 'wordle'];
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

  // ---- Crossclimb: a miss, fill, arrange, ends ----
  if (has('crossclimb')) {
    const p = load('crossclimb');
    await page.goto(`${BASE}/#/day/${N}/crossclimb`);
    await page.waitForSelector('.ladder');
    await page.click('.rung[data-row="0"] input');
    await page.keyboard.type('Q'.repeat(p.length));
    await page.fill('.rung[data-row="0"] input', '');
    for (let i = 0; i < p.rungs.length; i++) {
      const sel = `.rung[data-row="${i}"] input`;
      if (!(await page.locator(sel).count())) continue;
      await page.click(sel);
      await page.fill(sel, '');
      await page.keyboard.type(p.rungs[i].word);
    }
    const words = async () => (await page.locator('.ladder > .rung').allTextContents()).slice(1, -1).map((t) => t.replace(/\s+/g, ''));
    const target = p.rungs.map((r) => r.word);
    for (let pos = 0; pos < target.length; pos++) {
      const at = (await words()).indexOf(target[pos]);
      if (at !== pos) {
        await page.locator('.ladder > .rung').nth(pos + 1).click();
        await page.locator('.ladder > .rung').nth(at + 1).click();
      }
    }
    await page.click('.rung[data-row="top"] input');
    await page.keyboard.type(p.ends.top);
    if (await page.locator('.rung[data-row="bottom"] input').count()) {
      await page.click('.rung[data-row="bottom"] input');
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
  for (const g of ['wordle', 'mini'].filter(has)) {
    await small.goto(`${BASE}/#/day/${N}/${g}`);
    await small.waitForSelector(g === 'wordle' ? '.wordle' : '.mini');
    ok(await small.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `320px: ${g} fits the screen`);
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
