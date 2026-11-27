import { h, s, mount, shake } from '../dom.ts';
import { adjacent, isCell, judgeTrace, key } from '../../core/wend.ts';
import type { Cell, WendBoard, WendPuzzle } from '../../core/types.ts';
import { INKS, fill, type GameProps, type GameView } from './types.ts';

export interface WendWip {
  found: number[];
  attempts: number;
}

export const WEND_HOWTO =
  'Drag through neighbouring letters to spell a word, or tap them one by one and tap the last letter again. Every letter belongs to exactly one word.';

export function wendGame(props: GameProps<WendPuzzle, WendWip, WendBoard>): GameView {
  const p = props.puzzle;
  const rows = p.grid.length;
  const cols = p.grid[0]!.length;
  const found: number[] = props.solved ? props.solved.order.slice() : (props.wip?.found ?? []).slice();
  let attempts = props.wip?.attempts ?? 0;
  let trace: Cell[] = [];
  let dragging = false;
  let tapMode = false;

  const owner = new Map<number, number>();
  const recomputeOwners = () => {
    owner.clear();
    for (const i of found) for (const c of p.words[i]!.path) owner.set(key(c), i);
  };
  recomputeOwners();

  const done = () => found.length === p.words.length;
  const inkOf = (i: number) => INKS[found.indexOf(i) % INKS.length]!;
  const free = (c: Cell) => isCell(p.grid, c) && !owner.has(key(c));
  const onTrace = (c: Cell) => trace.some((t) => key(t) === key(c));

  const gridStyle = { gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` };
  const tiles = h('div', { class: 'layer', style: gridStyle });
  const svg = s('svg', { viewBox: `0 0 ${cols} ${rows}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  const letters = h('div', { class: 'layer', style: gridStyle });
  const board = h(
    'div',
    {
      class: 'wend',
      role: 'grid',
      'aria-label': `Wend grid, ${rows} rows by ${cols} columns`,
      style: { aspectRatio: `${cols} / ${rows}`, maxWidth: `${cols * 78}px` },
    },
    tiles,
    svg,
    letters,
  );
  const feedback = h('p', { class: 'feedback', role: 'status' });
  const theme = h('p', { class: 'theme' });

  // Word tracker under the grid, as in LinkedIn's Wend: one row of boxes per word, shortest first.
  // A found word fills the first open row of its length, so equal-length rows never give away which is which.
  const rowLens = p.words.map((w) => w.word.length).sort((a, b) => a - b);
  // Same width as the board, inset by a tile's margin (5% of a cell), so the rows line up with the grid's left edge.
  const inset = `${5 / cols}%`;
  const slots = h('div', {
    class: 'wend-slots',
    role: 'img',
    style: { maxWidth: `${cols * 78}px`, paddingLeft: inset, paddingRight: inset },
  });
  slots.style.setProperty('--n', String(rowLens[rowLens.length - 1] ?? 1));
  const lensText = (() => {
    const ls = rowLens.map(String);
    return ls.length > 1 ? `${ls.slice(0, -1).join(', ')} and ${ls[ls.length - 1]}` : ls[0] ?? '';
  })();

  const centre = (c: Cell) => `${c[1] + 0.5},${c[0] + 0.5}`;

  function render(): void {
    const tileEls: HTMLElement[] = [];
    const letterEls: HTMLElement[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell: Cell = [r, c];
        const ch = p.grid[r]![c]!;
        const own = owner.get(key(cell));
        if (ch === '#') {
          tileEls.push(h('div', { class: 'tile wall' }));
          letterEls.push(h('div', { class: 'letter' }));
          continue;
        }
        tileEls.push(
          h('div', {
            class: ['tile', own !== undefined && 'found', onTrace(cell) && 'trace'],
            style: own !== undefined ? { background: fill(inkOf(own)) } : undefined,
          }),
        );
        letterEls.push(h('div', { class: ['letter', own !== undefined && 'found'] }, ch));
      }
    }
    mount(tiles, tileEls);
    mount(letters, letterEls);

    const lines: SVGElement[] = [];
    for (const i of found) {
      lines.push(
        s('polyline', {
          points: p.words[i]!.path.map(centre).join(' '),
          fill: 'none',
          stroke: inkOf(i),
          'stroke-width': 0.2,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        }),
      );
    }
    if (trace.length) {
      lines.push(
        s('polyline', {
          points: trace.map(centre).join(' '),
          fill: 'none',
          stroke: 'var(--pink)',
          'stroke-width': 0.2,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        }),
      );
    }
    mount(svg, lines);

    const rowWord: (number | undefined)[] = rowLens.map(() => undefined);
    for (const i of found) {
      const len = p.words[i]!.word.length;
      const r = rowLens.findIndex((l, j) => l === len && rowWord[j] === undefined);
      if (r >= 0) rowWord[r] = i;
    }
    mount(
      slots,
      rowLens.map((len, r) => {
        const i = rowWord[r];
        const word = i === undefined ? '' : p.words[i]!.word;
        const bg = i === undefined ? undefined : { background: fill(inkOf(i), 75) };
        return h(
          'div',
          { class: ['slot', i !== undefined && 'found'] },
          Array.from({ length: len }, (_, j) => h('span', { style: bg }, word[j] ?? '')),
        );
      }),
    );
    const names = found.map((i) => p.words[i]!.word).join(', ');
    slots.setAttribute(
      'aria-label',
      `${p.words.length} words of ${lensText} letters; ${found.length} found${names ? `: ${names}` : ''}`,
    );
    theme.textContent = done() ? p.theme ?? '' : '';
  }

  function persist(): void {
    props.save({ found, attempts });
  }

  function say(text: string, tone: 'good' | 'bad' | '' = ''): void {
    feedback.textContent = text;
    feedback.className = `feedback ${tone}`;
  }

  function submit(): void {
    const res = judgeTrace(p, new Set(found), trace);
    trace = [];
    tapMode = false;
    if (res.ok) {
      found.push(res.index);
      recomputeOwners();
      say(p.words[res.index]!.word, 'good');
      persist();
      render();
      if (done()) props.onSolve({ order: found.slice() }, attempts);
      return;
    }
    if (res.reason !== 'too-short') {
      attempts++;
      say(res.reason === 'wrong-place' ? 'Right word, wrong spot.' : "Not one of today's words.", 'bad');
      shake(board);
      persist();
    }
    render();
  }

  function cellAt(ev: PointerEvent, strict: boolean): Cell | null {
    const rect = board.getBoundingClientRect();
    const cw = rect.width / cols;
    const ch = rect.height / rows;
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const c = Math.floor(x / cw);
    const r = Math.floor(y / ch);
    if (r < 0 || c < 0 || r >= rows || c >= cols) return null;
    if (strict) {
      // Only register near a cell's centre, so a diagonal slip doesn't catch a corner.
      const dx = Math.abs(x - (c + 0.5) * cw);
      const dy = Math.abs(y - (r + 0.5) * ch);
      if (Math.max(dx, dy) > 0.38 * Math.min(cw, ch)) return null;
    }
    return [r, c];
  }

  if (!done()) {
    board.addEventListener('pointerdown', (ev) => {
      const cell = cellAt(ev, false);
      if (!cell || !free(cell)) return;
      ev.preventDefault();
      if (tapMode && trace.length) {
        const last = trace[trace.length - 1]!;
        if (key(last) === key(cell)) {
          if (trace.length >= 2) submit();
          else {
            trace = [];
            tapMode = false;
            render();
          }
          return;
        }
        if (trace.length >= 2 && key(trace[trace.length - 2]!) === key(cell)) {
          trace.pop();
          render();
          return;
        }
        if (adjacent(last, cell) && !onTrace(cell)) {
          trace.push(cell);
          say('Tap the last letter again to check the word.');
          render();
          return;
        }
      }
      trace = [cell];
      dragging = true;
      tapMode = false;
      say('');
      board.setPointerCapture(ev.pointerId);
      render();
    });
    board.addEventListener('pointermove', (ev) => {
      if (!dragging) return;
      const cell = cellAt(ev, true);
      if (!cell) return;
      const last = trace[trace.length - 1]!;
      if (key(last) === key(cell)) return;
      if (trace.length >= 2 && key(trace[trace.length - 2]!) === key(cell)) {
        trace.pop();
        render();
      } else if (adjacent(last, cell) && free(cell) && !onTrace(cell)) {
        trace.push(cell);
        render();
      }
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      if (trace.length >= 2) submit();
      else {
        tapMode = true;
        say('Tap the next letter, or tap this one again to cancel.');
        render();
      }
    };
    board.addEventListener('pointerup', end);
    board.addEventListener('pointercancel', () => {
      dragging = false;
      trace = [];
      render();
    });
  }

  render();
  return { el: h('div', null, board, feedback, slots, theme) };
}
