import { h, mount, plural } from '../dom.ts';
import { PAR, SIZE, SQUARES, marks, solution, startTiles, swap, wasted, type Mark } from '../../core/hashtag.ts';
import type { HashtagBoard, HashtagPuzzle } from '../../core/types.ts';
import type { GameProps, GameView } from './types.ts';

export interface HashtagWip {
  /** The 16 letters as they stand, square by square. */
  tiles: string;
  swaps: [number, number][];
  misses: number;
  selected: number | null;
}

export const HASHTAG_HOWTO = `Swap letters to spell two words across and two down. Tap two letters, or drag one onto another. Green is locked in; yellow belongs in that word, elsewhere. Par is ${PAR} swaps.`;

const SAY: Record<Mark, string> = { hit: 'in the right spot', near: 'in this word, elsewhere', miss: 'belongs in another word' };
/** How far a press has to move before it counts as a drag rather than a tap. */
const DRAG_PX = 10;

export function hashtagGame(props: GameProps<HashtagPuzzle, HashtagWip, HashtagBoard>): GameView {
  const p = props.puzzle;
  const target = solution(p);
  const solved = props.solved;
  const w = props.wip;
  const same = (t: unknown): t is string => typeof t === 'string' && t.length === target.length && [...t].sort().join('') === [...target].sort().join('');

  let tiles = solved ? target : same(w?.tiles) ? w.tiles : startTiles(p);
  const swaps: [number, number][] = solved ? solved.swaps.map((s) => [s[0], s[1]]) : (w?.swaps ?? []).map((s) => [s[0], s[1]]);
  let misses = w?.misses ?? 0;
  let selected: number | null = solved ? null : w?.selected ?? null;
  let fresh: number[] = [];

  const done = () => tiles === target;
  const locked = (i: number) => tiles[i] === target[i];
  if (selected !== null && locked(selected)) selected = null;

  const board = h('div', { class: 'hashtag', role: 'group', 'aria-label': 'Hashtag grid, two words across and two down' });
  const count = h('p', { class: 'hash-count' });
  const feedback = h('p', { class: 'feedback', role: 'status' });
  const words = h('p', { class: 'theme' });
  let els: (HTMLButtonElement | null)[] = [];

  const say = (text: string, tone: 'good' | 'bad' | '' = '') => {
    feedback.textContent = text;
    feedback.className = `feedback ${tone}`;
  };
  const persist = () => props.save({ tiles, swaps, misses, selected });

  function render(): void {
    const m = marks(target, tiles);
    const rows: HTMLElement[] = [];
    els = [];
    for (let r = 0; r < SIZE; r++) {
      const cells: HTMLElement[] = [];
      for (let c = 0; c < SIZE; c++) {
        const i = SQUARES.findIndex(([y, x]) => y === r && x === c);
        if (i < 0) {
          cells.push(h('div', { class: 'hblank', 'aria-hidden': 'true' }));
          continue;
        }
        const on = selected === i;
        const b = h(
          'button',
          {
            type: 'button',
            class: ['htile', m[i], on && 'on', fresh.includes(i) && 'fresh'],
            'data-i': i,
            disabled: !!solved || done() || m[i] === 'hit',
            'aria-pressed': on ? 'true' : 'false',
            'aria-label': `${tiles[i]}, row ${r + 1}, column ${c + 1}, ${SAY[m[i]!]}${on ? ', picked' : ''}`,
            // Pointer taps and drags are handled on the board; this is for keyboards (Enter or Space).
            onclick: (ev: MouseEvent) => {
              if (ev.detail === 0) tap(i);
            },
          },
          tiles[i],
        );
        els[i] = b;
        cells.push(b);
      }
      rows.push(h('div', { class: 'hrow' }, cells));
    }
    mount(board, rows);

    const used = swaps.length;
    count.className = ['hash-count', used > PAR && 'over'].filter(Boolean).join(' ');
    count.textContent = solved
      ? ''
      : used < PAR
        ? `${PAR - used} of ${PAR} swaps left`
        : used === PAR
          ? `All ${PAR} swaps used`
          : `${plural(used - PAR, 'swap')} past ${PAR}`;
    words.textContent = done() ? `${p.across.join(' and ')} across, ${p.down.join(' and ')} down.${p.theme ? ` ${p.theme}` : ''}` : '';
  }

  function trade(a: number, b: number): void {
    if (tiles[a] === tiles[b]) {
      selected = null;
      say('Those are the same letter.', 'bad');
      persist();
      render();
      return;
    }
    const before = tiles;
    tiles = swap(tiles, a, b);
    swaps.push([a, b]);
    if (wasted(target, before, tiles)) misses++;
    selected = null;
    fresh = [a, b];
    persist();
    if (done()) {
      say(swaps.length <= PAR ? 'Solved!' : 'Got there!', 'good');
      render();
      props.onSolve({ swaps: swaps.map((s) => [s[0], s[1]]) }, misses);
      return;
    }
    const both = locked(a) && locked(b);
    if (swaps.length === PAR) say(`That was swap ${PAR}. Keep going: there’s no limit, it just counts.`);
    else say(both ? 'Both in place.' : '', both ? 'good' : '');
    render();
  }

  function tap(i: number): void {
    if (done() || locked(i)) return;
    fresh = [];
    if (selected === null) {
      selected = i;
      say(`Swap ${tiles[i]} with…`);
    } else if (selected === i) {
      selected = null;
      say('');
    } else {
      trade(selected, i);
      return;
    }
    persist();
    render();
  }

  function squareAt(ev: PointerEvent): number | null {
    const rect = board.getBoundingClientRect();
    const c = Math.floor(((ev.clientX - rect.left) / rect.width) * SIZE);
    const r = Math.floor(((ev.clientY - rect.top) / rect.height) * SIZE);
    const i = SQUARES.findIndex(([y, x]) => y === r && x === c);
    return i < 0 ? null : i;
  }

  if (!solved) {
    let press: { i: number; x: number; y: number; moved: boolean; over: number | null } | null = null;
    const clearMarks = () => els.forEach((b) => b?.classList.remove('lift', 'over'));

    board.addEventListener('pointerdown', (ev) => {
      if (done() || ev.button > 0) return;
      const i = squareAt(ev);
      if (i === null) return;
      ev.preventDefault();
      if (locked(i)) {
        say('Green letters are locked in.');
        return;
      }
      press = { i, x: ev.clientX, y: ev.clientY, moved: false, over: null };
      board.setPointerCapture(ev.pointerId);
    });
    board.addEventListener('pointermove', (ev) => {
      if (!press) return;
      if (!press.moved && Math.hypot(ev.clientX - press.x, ev.clientY - press.y) < DRAG_PX) return;
      press.moved = true;
      const j = squareAt(ev);
      press.over = j !== null && j !== press.i && !locked(j) ? j : null;
      clearMarks();
      els[press.i]?.classList.add('lift');
      if (press.over !== null) els[press.over]?.classList.add('over');
    });
    board.addEventListener('pointerup', () => {
      const pr = press;
      press = null;
      if (!pr) return;
      clearMarks();
      if (!pr.moved) tap(pr.i);
      else if (pr.over !== null) {
        fresh = [];
        trade(pr.i, pr.over);
      }
    });
    board.addEventListener('pointercancel', () => {
      press = null;
      clearMarks();
    });
  }

  render();
  if (solved) return { el: h('div', null, board, words) };
  return { el: h('div', null, board, count, feedback, words) };
}
