import { h, mount, shake } from '../dom.ts';
import { ROWS, checkGuess, clean, keyStates, score, type Mark } from '../../core/wordle.ts';
import type { WordleBoard, WordlePuzzle } from '../../core/types.ts';
import type { GameProps, GameView } from './types.ts';
import { BACK, ENTER, keyboard } from './keyboard.ts';
import { dock } from './dock.ts';

export interface WordleWip {
  guesses: string[];
  current: string;
}

export const WORDLE_HOWTO = 'Guess the word. Green letters are in the right spot, yellow ones are in the word somewhere else.';

const SAY: Record<Mark, string> = { hit: 'in the right spot', near: 'in the word, elsewhere', miss: 'not in the word' };

// The guess list loads once per page, only when a Wordle opens. If it fails, any guess is allowed.
let wordsPromise: Promise<Set<string> | null> | null = null;
function loadWords(): Promise<Set<string> | null> {
  return (wordsPromise ??= fetch('/words.txt')
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
    .then(
      (t) =>
        new Set(
          t
            .split('\n')
            .filter((l) => l && !l.startsWith('#'))
            .map((l) => l.trim().toUpperCase()),
        ),
    )
    .catch(() => {
      wordsPromise = null; // try again next time
      return null;
    }));
}

export function wordleGame(props: GameProps<WordlePuzzle, WordleWip, WordleBoard>): GameView {
  const p = props.puzzle;
  const answer = clean(p.answer);
  const L = answer.length;
  const solved = props.solved;
  const guesses: string[] = solved ? solved.guesses.slice() : (props.wip?.guesses ?? []).slice();
  let current = solved ? '' : props.wip?.current ?? '';
  let busy = false;
  let fresh = -1;

  const grid = h('div', { class: 'wordle', role: 'grid', 'aria-label': `${L}-letter word`, style: `--len: ${L}` });
  const feedback = h('p', { class: 'feedback', role: 'status' });
  const done = () => guesses.includes(answer);

  const say = (text: string, tone: 'good' | 'bad' | '' = '') => {
    feedback.textContent = text;
    feedback.className = `feedback ${tone}`;
  };
  const persist = () => props.save({ guesses, current });

  function row(letters: string, marks: Mark[] | null, cls: string[] = []): HTMLElement {
    return h(
      'div',
      { class: ['wrow', ...cls], role: 'row' },
      Array.from({ length: L }, (_, i) => {
        const ch = letters[i] ?? '';
        const m = marks?.[i];
        return h(
          'div',
          {
            class: ['wtile', m, ch && !m && 'typed'],
            role: 'gridcell',
            'aria-label': ch ? (m ? `${ch}, ${SAY[m]}` : ch) : 'empty',
            style: m && cls.includes('fresh') ? { animationDelay: `${i * 90}ms` } : undefined,
          },
          ch,
        );
      }),
    );
  }

  function render(): void {
    const rows: HTMLElement[] = guesses.map((g, i) => row(g, score(g, answer), i === fresh ? ['fresh'] : []));
    if (!done()) rows.push(row(current, null, ['current']));
    while (rows.length < ROWS) rows.push(row('', null));
    mount(grid, rows);
    kb?.paint(keyStates(guesses, answer));
  }

  async function submit(): Promise<void> {
    if (busy || done()) return;
    const currentRow = () => grid.querySelector('.wrow.current') as HTMLElement | null;
    if (current.length < L) {
      say('Not enough letters.', 'bad');
      shake(currentRow() ?? grid);
      return;
    }
    busy = true;
    const words = await loadWords();
    busy = false;
    const check = checkGuess(p, current, guesses, words);
    if (check !== 'ok') {
      say(check === 'repeat' ? 'You tried that one.' : 'Not in the word list.', 'bad');
      shake(currentRow() ?? grid);
      return;
    }
    guesses.push(current);
    fresh = guesses.length - 1;
    current = '';
    persist();
    if (done()) {
      say(guesses.length === 1 ? 'First try!' : 'Got it!', 'good');
      render();
      kb?.destroy();
      dk?.destroy();
      props.onSolve({ guesses: guesses.slice() }, guesses.length - 1);
      return;
    }
    say(guesses.length === ROWS ? 'Keep going: here’s another row.' : '');
    render();
    // Past the sixth row the grid grows: keep the row being typed above the keys.
    if (guesses.length >= ROWS) dk?.reveal(grid.querySelector('.wrow.current'));
  }

  function onKey(k: string): void {
    if (done()) return;
    if (k === ENTER) {
      void submit();
      return;
    }
    if (k === BACK) current = current.slice(0, -1);
    else if (/^[A-Z]$/.test(k) && current.length < L) current += k;
    else return;
    fresh = -1;
    say('');
    persist();
    render();
  }

  const kb = solved ? null : keyboard({ onKey, enter: 'Enter' });
  // Feedback and keys sit in a dock pinned to the bottom of the screen; the grid sizes itself to the space above.
  // Past the sixth row it no longer fits, so the row being typed is what stays in view.
  const revealGrid = () => dk?.reveal(guesses.length < ROWS ? grid : grid.querySelector('.wrow.current'), false);
  const dk = solved ? null : dock([feedback, kb!.el], revealGrid);
  render();
  if (!solved) void loadWords();

  if (solved) {
    return { el: h('div', null, grid, h('p', { class: 'theme' }, `The word: ${answer}`)) };
  }
  requestAnimationFrame(revealGrid);
  return {
    el: h('div', { class: 'docked' }, grid, dk!.el),
    destroy: () => {
      kb!.destroy();
      dk!.destroy();
    },
  };
}
