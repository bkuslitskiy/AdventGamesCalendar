import { h, mount, plural, shake } from '../dom.ts';
import { GROUP_SIZE, groupOf, guessKey, judgeGroup, norm } from '../../core/connections.ts';
import { shuffled } from '../../core/rand.ts';
import type { ConnectionsBoard, ConnectionsPuzzle } from '../../core/types.ts';
import { fill, type GameProps, type GameView } from './types.ts';

export interface ConnectionsWip {
  order: number[];
  guesses: string[][];
  attempts: number;
  /** Remaining tiles in their current (shuffled) order. */
  tiles: string[];
  selected: string[];
}

export const CONNECTIONS_HOWTO = 'Find four groups of four that share something. Pick four words and submit. Mistakes are counted but never end the game.';

/** Group colours, easiest to hardest. */
export const LEVEL_INKS = ['#ffcc29', '#2fc49b', '#4a90ff', '#b18cff'];
const LEVEL_NAMES = ['yellow', 'green', 'blue', 'purple'];

export function connectionsGame(props: GameProps<ConnectionsPuzzle, ConnectionsWip, ConnectionsBoard>): GameView {
  const p = props.puzzle;
  const solved = props.solved;
  const w = props.wip;
  const all = p.groups.flatMap((g) => g.words.map(norm));

  const order: number[] = solved ? solved.order.slice() : (w?.order ?? []).slice();
  const guesses: string[][] = solved ? solved.guesses.map((g) => g.slice()) : (w?.guesses ?? []).map((g) => g.slice());
  let attempts = w?.attempts ?? 0;
  const foundWords = () => new Set(order.flatMap((i) => p.groups[i]!.words.map(norm)));
  // Keep a saved tile order only if it still matches what's left.
  const left = () => all.filter((x) => !foundWords().has(x));
  let tiles = w?.tiles && w.tiles.length === left().length && w.tiles.every((t) => left().includes(t)) ? w.tiles.slice() : shuffled(left(), props.rev);
  const selected = new Set<string>((w?.selected ?? []).filter((s) => tiles.includes(s)));

  const groupsEl = h('div', { class: 'conn-found' });
  const gridEl = h('div', { class: 'conn-grid', role: 'group', 'aria-label': 'Words' });
  const feedback = h('p', { class: 'feedback', role: 'status' });
  const mistakes = h('p', { class: 'misses conn-mistakes' });
  const submitBtn = h('button', { class: 'btn', type: 'button', onclick: () => submit() }, 'Submit');
  const clearBtn = h(
    'button',
    {
      class: 'btn ghost',
      type: 'button',
      onclick: () => {
        selected.clear();
        persist();
        render();
      },
    },
    'Deselect all',
  );
  const shuffleBtn = h(
    'button',
    {
      class: 'btn ghost',
      type: 'button',
      onclick: () => {
        tiles = shuffled(tiles, Date.now());
        persist();
        render();
      },
    },
    'Shuffle',
  );
  const controls = h('div', { class: 'conn-controls' }, shuffleBtn, clearBtn, submitBtn);

  const persist = () => props.save({ order, guesses, attempts, tiles, selected: [...selected] });
  const say = (text: string, tone: 'good' | 'bad' | '' = '') => {
    feedback.textContent = text;
    feedback.className = `feedback ${tone}`;
  };

  const groupBar = (i: number) =>
    h(
      'div',
      { class: 'conn-group', style: { background: fill(LEVEL_INKS[i]!, 80) }, 'aria-label': `${LEVEL_NAMES[i]} group: ${p.groups[i]!.name}` },
      h('strong', null, p.groups[i]!.name),
      h('span', null, p.groups[i]!.words.map(norm).join(', ')),
    );

  function render(): void {
    mount(groupsEl, order.map(groupBar));
    mount(
      gridEl,
      tiles.map((t) =>
        h(
          'button',
          {
            type: 'button',
            class: ['conn-tile', selected.has(t) && 'on'],
            // Font size follows the longest word on the tile (CSS), so words never break mid-word.
            style: `--chars: ${Math.max(4, ...t.split(' ').map((x) => x.length))}`,
            'aria-pressed': selected.has(t) ? 'true' : 'false',
            onclick: () => {
              if (selected.has(t)) selected.delete(t);
              else if (selected.size < GROUP_SIZE) selected.add(t);
              else return;
              say('');
              persist();
              render();
            },
          },
          t,
        ),
      ),
    );
    submitBtn.disabled = selected.size !== GROUP_SIZE;
    clearBtn.disabled = selected.size === 0;
    mistakes.textContent = attempts ? `${plural(attempts, 'mistake')} so far` : '';
  }

  function submit(): void {
    if (selected.size !== GROUP_SIZE) return;
    const pick = [...selected];
    if (guesses.some((g) => guessKey(g) === guessKey(pick))) {
      say('You tried those four already.', 'bad');
      return;
    }
    guesses.push(pick);
    const verdict = judgeGroup(p, pick, new Set(order));
    if (verdict.kind === 'group') {
      order.push(verdict.index);
      tiles = tiles.filter((t) => !selected.has(t));
      selected.clear();
      say(p.groups[verdict.index]!.name, 'good');
      persist();
      render();
      if (order.length === p.groups.length) props.onSolve({ order: order.slice(), guesses: guesses.map((g) => g.slice()) }, attempts);
      return;
    }
    attempts++;
    say(verdict.kind === 'one-away' ? 'One away…' : 'Not a group.', 'bad');
    shake(gridEl);
    persist();
    render();
  }

  /** A small recap: one row of squares per guess, coloured by each word's group. */
  function recap(): HTMLElement {
    return h(
      'div',
      { class: 'conn-recap', 'aria-label': `${guesses.length} guesses` },
      guesses.map((g) =>
        h(
          'div',
          { class: 'conn-recap-row' },
          g.map((word) => h('i', { style: { background: fill(LEVEL_INKS[groupOf(p, word)] ?? '#999', 85) } })),
        ),
      ),
    );
  }

  render();
  if (solved) return { el: h('div', null, groupsEl, recap()) };
  return { el: h('div', null, groupsEl, gridEl, feedback, controls, mistakes) };
}
