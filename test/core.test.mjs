import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as time from '../public/js/core/time.js';
import { judge, singular, validatePinpoint } from '../public/js/core/pinpoint.js';
import { validateWend, judgeTrace, countPlacements, layout } from '../public/js/core/wend.js';
import { validateCrossclimb, endFits, isLadder } from '../public/js/core/crossclimb.js';
import { replay } from '../public/js/core/replay.js';
import { dayStatus } from '../public/js/core/calendar.js';
import { mulberry32 } from '../public/js/core/rand.js';

const T = (s) => Date.parse(s);

test('days open at midnight New York (UTC-5 all December)', () => {
  assert.equal(time.opensAt(1), T('2026-12-01T05:00:00Z'));
  assert.equal(time.opensAt(31), T('2026-12-31T05:00:00Z'));
  assert.equal(time.dayEnd(31), T('2027-01-01T05:00:00Z'));
  assert.equal(time.zonedMidnight(2026, 7, 1), T('2026-07-01T04:00:00Z'), 'summer is UTC-4');
});

test('todayN', () => {
  assert.equal(time.todayN(T('2026-11-30T12:00:00Z')), 0);
  assert.equal(time.todayN(T('2026-12-01T04:59:59Z')), 0);
  assert.equal(time.todayN(T('2026-12-01T05:00:00Z')), 1);
  assert.equal(time.todayN(T('2026-12-31T05:00:00Z')), 31);
  assert.equal(time.todayN(T('2027-02-01T00:00:00Z')), 31);
});

test('late-publish deadline = +24h rounded up to the next ET midnight', () => {
  assert.equal(time.ceilToMidnight(T('2026-12-03T05:00:00Z')), T('2026-12-03T05:00:00Z'));
  assert.equal(time.ceilToMidnight(T('2026-12-03T05:00:01Z')), T('2026-12-04T05:00:00Z'));
  // published 3pm ET Dec 5 -> 3pm Dec 6 -> midnight starting Dec 7
  assert.equal(time.lateDeadline(T('2026-12-05T20:00:00Z')), T('2026-12-07T05:00:00Z'));
  assert.equal(time.isLate('2026-12-02T04:59:59.999Z', '2026-12-02T05:00:00.000Z'), false);
  assert.equal(time.isLate('2026-12-02T05:00:00.001Z', '2026-12-02T05:00:00.000Z'), true);
});

test('pinpoint matcher', () => {
  const p = { answer: 'Things in a toolbox', reject: ['tools'] };
  for (const g of ['toolbox items', 'stuff in a tool box', 'things in a toolbx', 'Things in a TOOLBOX!', 'toolbox']) {
    assert.equal(judge(g, p), 'correct', g);
  }
  for (const g of ['tools', 'hardware', '', '   ', 'box', 'things']) assert.equal(judge(g, p), 'wrong', g);
  assert.equal(judge('salt & pepper', { answer: 'Salt and pepper' }), 'correct');
  assert.equal(judge('famous bridges', { answer: 'Bridges', aliases: [] }), 'correct');
  assert.equal(judge('rivers', { answer: 'Bridges' }), 'wrong');
  assert.equal(singular('boxes'), 'box');
  assert.equal(singular('berries'), 'berry');
  assert.equal(singular('glass'), 'glass');
  assert.equal(singular('bus'), 'bus');
});

test('pinpoint validator runs the puzzle tests', () => {
  const good = { clues: ['a', 'b', 'c', 'd', 'e'], answer: 'Bridges', tests: { accept: ['bridge'], reject: ['tunnels'] } };
  assert.deepEqual(validatePinpoint(good), []);
  const bad = { ...good, tests: { accept: ['tunnels'] } };
  assert.equal(validatePinpoint(bad).length, 1);
});

const OWL_CEDAR = {
  grid: ['OWL', '#RA', 'CED'],
  words: [
    { word: 'OWL', path: [[0, 0], [0, 1], [0, 2]] },
    { word: 'CEDAR', path: [[2, 0], [2, 1], [2, 2], [1, 2], [1, 1]] },
  ],
};

test('wend validation', () => {
  assert.deepEqual(validateWend(OWL_CEDAR), []);
  const broken = { ...OWL_CEDAR, words: [OWL_CEDAR.words[0]] };
  assert.ok(validateWend(broken).some((e) => e.includes('not in any word')));
  const diagonal = { grid: ['AB', 'CB'], words: [{ word: 'AB', path: [[0, 0], [1, 1]] }, { word: 'CB', path: [[1, 0], [0, 1]] }] };
  assert.ok(validateWend(diagonal).some((e) => e.includes('not orthogonally adjacent')));
});

test('wend accepts only the authored placement', () => {
  const found = new Set();
  assert.deepEqual(judgeTrace(OWL_CEDAR, found, [[0, 0], [0, 1], [0, 2]]), { ok: true, index: 0 });
  assert.deepEqual(judgeTrace(OWL_CEDAR, found, [[0, 2], [0, 1], [0, 0]]), { ok: false, reason: 'not-an-answer' });
  const twice = { grid: ['CAT', 'AT#'], words: [{ word: 'AT', path: [[0, 1], [0, 2]] }] };
  assert.deepEqual(judgeTrace(twice, found, [[1, 0], [1, 1]]), { ok: false, reason: 'wrong-place' });
  assert.deepEqual(judgeTrace(twice, new Set([0]), [[0, 1], [0, 2]]), { ok: false, reason: 'not-an-answer' });
});

test('wend placement counting flags ambiguous grids', () => {
  assert.equal(countPlacements(OWL_CEDAR.grid, ['OWL', 'CEDAR']), 1);
  assert.equal(countPlacements(['AB', 'BA'], ['AB', 'AB']), 2);
  assert.equal(countPlacements(['ABAB'], ['AB', 'AB']), 1);
});

test('wend layout fills a shape', () => {
  const p = layout(['...', '#..', '...'], ['owl', 'cedar'], mulberry32(7));
  assert.ok(p);
  assert.deepEqual(validateWend(p), []);
  const big = layout(['.....', '.#...', '.....', '...#.', '.....'], ['winter', 'frost', 'ember', 'snow', 'mug'], mulberry32(3));
  assert.ok(big, 'larger layout found');
  assert.deepEqual(validateWend(big), []);
  assert.equal(layout(['...'], ['ab']), null, 'letter count mismatch');
});

const LADDER = {
  length: 4,
  rungs: [
    { word: 'CORD', clue: 'x' },
    { word: 'CARD', clue: 'x' },
    { word: 'WARD', clue: 'x' },
  ],
  ends: { top: 'COLD', bottom: 'WARM', clue: 'x' },
};

test('crossclimb', () => {
  assert.deepEqual(validateCrossclimb(LADDER), []);
  assert.ok(isLadder(['CORD', 'CARD', 'WARD']));
  assert.ok(!isLadder(['CORD', 'WARD', 'CARD']));
  assert.ok(endFits(LADDER, ['CORD', 'CARD', 'WARD'], 'top', 'cold'));
  assert.ok(!endFits(LADDER, ['CORD', 'CARD', 'WARD'], 'top', 'WARM'));
  assert.ok(endFits(LADDER, ['WARD', 'CARD', 'CORD'], 'top', 'WARM'), 'reversed ladder flips the ends');
  assert.ok(validateCrossclimb({ ...LADDER, rungs: [LADDER.rungs[0], LADDER.rungs[2], LADDER.rungs[1]] }).length > 0);
});

test('replay: first solve wins, reset clears, void hides, void of void restores', () => {
  const base = { day: 1, game: 'wend', rev: 'r', device: 'd', payload: { board: { order: [] }, stats: { ms: 1, attempts: 0 } } };
  const ev = (id, type, extra = {}) => ({ id, type, tsServer: '2026-12-01T06:00:00Z', tsClient: '2026-12-01T06:00:00Z', ...base, ...extra });
  const dl = () => '2026-12-02T05:00:00.000Z';
  let events = [ev(1, 'solve'), ev(2, 'solve', { tsClient: '2026-12-03T00:00:00Z' })];
  assert.equal(replay(events, dl)[0].tsClient, '2026-12-01T06:00:00Z');
  events.push(ev(3, 'reset', { game: null }));
  assert.equal(replay(events, dl).length, 0);
  events.push(ev(4, 'solve', { tsClient: '2026-12-03T00:00:00Z' }));
  assert.equal(replay(events, dl)[0].late, true);
  events.push(ev(5, 'void', { day: null, game: null, payload: { ids: [4] } }));
  assert.equal(replay(events, dl).length, 0);
  events.push(ev(6, 'void', { day: null, game: null, payload: { ids: [5] } }));
  assert.equal(replay(events, dl).length, 1);
  events.push(ev(7, 'void', { day: null, game: null, payload: { ids: [3] } }));
  const after = replay(events, dl);
  assert.equal(after.length, 1);
  assert.equal(after[0].tsClient, '2026-12-01T06:00:00Z', 'voiding the reset brings back the first solve');
});

test('day status', () => {
  const solves = new Map([['1:wend', { late: false }], ['1:pinpoint', { late: true }]]);
  assert.equal(dayStatus(1, false, ['wend'], solves), 'locked');
  assert.equal(dayStatus(1, true, [], solves), 'empty');
  assert.equal(dayStatus(1, true, ['wend'], solves), 'ontime');
  assert.equal(dayStatus(1, true, ['wend', 'pinpoint'], solves), 'late');
  assert.equal(dayStatus(1, true, ['wend', 'pinpoint', 'crossclimb'], solves), 'unsolved');
});
