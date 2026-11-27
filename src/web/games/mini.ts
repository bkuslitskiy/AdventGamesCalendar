import { h, mount, shake } from '../dom.ts';
import { entries, isFull, isSolved, isWhite, numbering, type Dir, type Entry } from '../../core/mini.ts';
import type { MiniBoard, MiniPuzzle } from '../../core/types.ts';
import type { GameProps, GameView } from './types.ts';
import { BACK, keyboard } from './keyboard.ts';
import { dock } from './dock.ts';

export interface MiniWip {
  /** Same shape as the grid; ' ' for an empty square. */
  fill: string[];
  r: number;
  c: number;
  dir: Dir;
  attempts: number;
}

export const MINI_HOWTO = 'A small crossword. Tap a square to pick it, tap it again to switch between across and down. It checks itself when the grid is full.';

const EMPTY = ' ';

export function miniGame(props: GameProps<MiniPuzzle, MiniWip, MiniBoard>): GameView {
  const p = props.puzzle;
  const g = p.grid;
  const R = g.length;
  const C = g[0]!.length;
  const list = entries(g);
  const nums = numbering(g);
  const ordered = [...list.filter((e) => e.dir === 'across'), ...list.filter((e) => e.dir === 'down')];
  const solved = props.solved;
  const w = props.wip;

  const blank = g.map((row) => row.replace(/[A-Z]/g, EMPTY));
  const sameShape = (rows: string[] | undefined) =>
    !!rows && rows.length === R && rows.every((row, r) => row.length === C && [...row].every((ch, c) => (ch === '#') === (g[r]![c] === '#')));
  const fill: string[][] = (solved && sameShape(solved.grid) ? solved.grid : sameShape(w?.fill) ? w!.fill : blank).map((row) => [...row]);

  const firstWhite = (): [number, number] => {
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (isWhite(g, r, c)) return [r, c];
    return [0, 0];
  };
  let [r, c] = w && isWhite(g, w.r, w.c) ? [w.r, w.c] : firstWhite();
  let dir: Dir = w?.dir ?? 'across';
  let attempts = w?.attempts ?? 0;

  const rows = () => fill.map((row) => row.join(''));
  const empty = (y: number, x: number) => !/[A-Z]/.test(fill[y]![x]!);
  const entryAt = (y: number, x: number, d: Dir): Entry | undefined =>
    list.find((e) => e.dir === d && e.cells.some(([ey, ex]) => ey === y && ex === x));
  const other = (d: Dir): Dir => (d === 'across' ? 'down' : 'across');
  if (!entryAt(r, c, dir)) dir = other(dir);
  const current = () => entryAt(r, c, dir) ?? entryAt(r, c, other(dir))!;
  const entryFull = (e: Entry) => e.cells.every(([y, x]) => !empty(y, x));
  const clueOf = (e: Entry) => p.clues[e.dir][String(e.num)] ?? '';

  const clueBar = h('div', { class: 'mini-clue' });
  const gridEl = h('div', {
    class: 'mini',
    role: 'grid',
    'aria-label': `Crossword, ${R} by ${C}`,
    style: {
      gridTemplateColumns: `repeat(${C}, minmax(0, 1fr))`,
      gridTemplateRows: `repeat(${R}, minmax(0, 1fr))`,
      aspectRatio: `${C} / ${R}`,
    },
  });
  // The CSS caps the width at 68px a square, and below the keys at what fits above the dock.
  gridEl.style.setProperty('--cols', String(C));
  gridEl.style.setProperty('--rows', String(R));
  const cluesEl = h('div', { class: 'mini-clues' });
  const feedback = h('p', { class: 'feedback', role: 'status' });

  const persist = () => props.save({ fill: rows(), r, c, dir, attempts });
  const say = (text: string, tone: 'good' | 'bad' | '' = '') => {
    feedback.textContent = text;
    feedback.className = `feedback ${tone}`;
  };

  function select(e: Entry, firstEmpty = true): void {
    dir = e.dir;
    const cell = (firstEmpty && e.cells.find(([y, x]) => empty(y, x))) || e.cells[0]!;
    [r, c] = cell;
  }

  function nextEntry(step: 1 | -1): void {
    const cur = current();
    const i = ordered.indexOf(cur);
    // Prefer the next clue that still has empty squares; otherwise just the next clue.
    for (let k = 1; k <= ordered.length; k++) {
      const e = ordered[(i + step * k + ordered.length * k) % ordered.length]!;
      if (!entryFull(e)) return select(e);
    }
    select(ordered[(i + step + ordered.length) % ordered.length]!, false);
  }

  function advance(): void {
    const e = current();
    const idx = e.cells.findIndex(([y, x]) => y === r && x === c);
    const after = e.cells.slice(idx + 1).find(([y, x]) => empty(y, x));
    if (after) {
      [r, c] = after;
      return;
    }
    const before = e.cells.slice(0, idx).find(([y, x]) => empty(y, x));
    if (before) {
      [r, c] = before;
      return;
    }
    // Word is full: keep going through it if we were mid-word, else on to the next open clue.
    if (idx < e.cells.length - 1) [r, c] = e.cells[idx + 1]!;
    else if (!isFull(g, rows())) nextEntry(1);
  }

  function changed(wasFull: boolean): void {
    persist();
    if (isFull(g, rows())) {
      if (isSolved(g, rows())) {
        render();
        kb?.destroy();
        dk?.destroy();
        say('Solved!', 'good');
        props.onSolve({ grid: rows() }, attempts);
        return;
      }
      if (!wasFull) {
        attempts++;
        persist();
        say('The grid is full, but something’s not right yet.', 'bad');
        shake(gridEl);
      }
    } else {
      say('');
    }
    render();
  }

  function onKey(k: string): void {
    const wasFull = isFull(g, rows());
    if (k === BACK) {
      if (!empty(r, c)) fill[r]![c] = EMPTY;
      else {
        const e = current();
        const idx = e.cells.findIndex(([y, x]) => y === r && x === c);
        if (idx > 0) {
          [r, c] = e.cells[idx - 1]!;
          fill[r]![c] = EMPTY;
        }
      }
    } else if (/^[A-Z]$/.test(k)) {
      fill[r]![c] = k;
      advance();
    } else return;
    changed(wasFull);
  }

  function move(dy: number, dx: number): void {
    const d: Dir = dx !== 0 ? 'across' : 'down';
    if (dir !== d && entryAt(r, c, d)) {
      dir = d;
      return render();
    }
    let y = r + dy;
    let x = c + dx;
    while (y >= 0 && y < R && x >= 0 && x < C && !isWhite(g, y, x)) {
      y += dy;
      x += dx;
    }
    if (isWhite(g, y, x)) {
      [r, c] = [y, x];
      if (!entryAt(r, c, dir)) dir = other(dir);
    }
    render();
  }

  function onOther(ev: KeyboardEvent): boolean {
    const arrows: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[ev.key]) {
      move(...arrows[ev.key]!);
      return true;
    }
    if (ev.key === 'Tab' || ev.key === 'Enter') {
      nextEntry(ev.shiftKey ? -1 : 1);
      render();
      return true;
    }
    if (ev.key === ' ') {
      toggle();
      return true;
    }
    return false;
  }

  function toggle(): void {
    if (entryAt(r, c, other(dir))) dir = other(dir);
    render();
  }

  function tap(y: number, x: number): void {
    if (!isWhite(g, y, x)) return;
    if (y === r && x === c) return toggle();
    else {
      [r, c] = [y, x];
      if (!entryAt(r, c, dir)) dir = other(dir);
    }
    render();
  }

  function render(): void {
    const live = !solved;
    const cur = live ? current() : null;
    const inCur = (y: number, x: number) => !!cur && cur.cells.some(([ey, ex]) => ey === y && ex === x);
    const cells: HTMLElement[] = [];
    for (let y = 0; y < R; y++) {
      for (let x = 0; x < C; x++) {
        if (!isWhite(g, y, x)) {
          cells.push(h('div', { class: 'mcell block', role: 'gridcell', 'aria-label': 'black square' }));
          continue;
        }
        const n = nums.get(`${y},${x}`);
        const ch = empty(y, x) ? '' : fill[y]![x]!;
        cells.push(
          h(
            'div',
            {
              class: ['mcell', live && y === r && x === c && 'sel', live && inCur(y, x) && 'word', solved && 'done'],
              role: 'gridcell',
              'aria-label': `${n ? `${n}, ` : ''}${ch || 'empty'}`,
              'data-r': y,
              'data-c': x,
            },
            n ? h('span', { class: 'num' }, n) : null,
            h('span', { class: 'ch' }, ch),
          ),
        );
      }
    }
    mount(gridEl, cells);

    if (cur) {
      mount(
        clueBar,
        h('button', { type: 'button', class: 'mini-nav', 'aria-label': 'Previous clue', onclick: () => (nextEntry(-1), render()) }, '‹'),
        h(
          'button',
          { type: 'button', class: 'mini-cluetext', title: 'Switch between across and down', onclick: toggle },
          h('b', null, `${cur.num}${cur.dir === 'across' ? 'A' : 'D'}`),
          ' ',
          clueOf(cur),
        ),
        h('button', { type: 'button', class: 'mini-nav', 'aria-label': 'Next clue', onclick: () => (nextEntry(1), render()) }, '›'),
      );
    }

    const cross = live ? entryAt(r, c, other(dir)) : undefined;
    mount(
      cluesEl,
      (['across', 'down'] as const).map((d) =>
        h(
          'div',
          null,
          h('h3', null, d === 'across' ? 'Across' : 'Down'),
          h(
            'ol',
            null,
            list
              .filter((e) => e.dir === d)
              .map((e) =>
                h(
                  'li',
                  null,
                  h(
                    'button',
                    {
                      type: 'button',
                      class: [e === cur && 'on', e === cross && 'cross', entryFull(e) && 'filled'],
                      disabled: !live,
                      onclick: () => {
                        select(e);
                        render();
                        // Picked from the list further down: bring the grid back into view to type.
                        dk?.reveal(gridEl);
                      },
                    },
                    h('b', null, e.num),
                    ' ',
                    clueOf(e),
                  ),
                ),
              ),
          ),
        ),
      ),
    );
  }

  gridEl.addEventListener('click', (ev) => {
    if (solved) return;
    const cell = (ev.target as HTMLElement).closest<HTMLElement>('[data-r]');
    if (cell) tap(Number(cell.dataset.r), Number(cell.dataset.c));
  });

  const kb = solved ? null : keyboard({ onKey, onOther });
  // The current clue, feedback and keys sit in a dock pinned to the bottom of the screen, below the grid
  // (which sizes itself to the space above it). The full clue list scrolls underneath.
  const revealGrid = () => dk?.reveal(gridEl, false);
  const dk = solved ? null : dock([clueBar, feedback, kb!.el], revealGrid);
  render();
  if (solved) return { el: h('div', null, gridEl, cluesEl) };
  requestAnimationFrame(revealGrid);
  return {
    el: h('div', { class: 'docked' }, gridEl, cluesEl, dk!.el),
    destroy: () => {
      kb!.destroy();
      dk!.destroy();
    },
  };
}
