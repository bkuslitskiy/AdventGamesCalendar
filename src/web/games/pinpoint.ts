import { h, mount, shake } from '../dom.ts';
import { judge } from '../../core/pinpoint.ts';
import type { PinpointBoard, PinpointPuzzle } from '../../core/types.ts';
import type { GameProps, GameView } from './types.ts';

export interface PinpointWip {
  guesses: string[];
  revealed: number;
}

export const PINPOINT_HOWTO = 'Five clues share a link. Name it in as few clues as you can; each miss reveals the next clue.';

export function pinpointGame(props: GameProps<PinpointPuzzle, PinpointWip, PinpointBoard>): GameView {
  const p = props.puzzle;
  const solved = props.solved;
  const misses: string[] = solved ? solved.guesses.slice(0, -1) : (props.wip?.guesses ?? []).slice();
  let revealed = solved ? solved.cluesSeen : props.wip?.revealed ?? 1;
  let fresh = -1;

  const clues = h('ol', { class: 'clues' });
  const feedback = h('p', { class: 'feedback', role: 'status' });
  const missesEl = h('p', { class: 'misses' });
  const input = h('input', {
    type: 'text',
    name: 'guess',
    placeholder: 'What links them?',
    autocomplete: 'off',
    autocapitalize: 'none',
    spellcheck: 'false',
    enterkeyhint: 'go',
    'aria-label': 'Your guess',
  });
  const form = h(
    'form',
    {
      class: 'guess',
      onsubmit: (ev: Event) => {
        ev.preventDefault();
        guess(input.value.trim());
      },
    },
    input,
    h('button', { class: 'btn', type: 'submit' }, 'Guess'),
  );

  function render(): void {
    mount(
      clues,
      p.clues.map((c, i) => {
        const shown = i < revealed;
        if (shown || solved) {
          return h('li', { class: [!shown && 'hidden', i === fresh && 'fresh'] }, h('span', { class: 'k' }, i + 1), c);
        }
        return h('li', { class: 'hidden' }, h('span', { class: 'k' }, i + 1), 'Hidden clue');
      }),
    );
    mount(missesEl, misses.length ? ['Not it: ', misses.map((m) => h('s', null, m))] : null);
  }

  function guess(g: string): void {
    if (!g) return;
    if (judge(g, p) === 'correct') {
      props.onSolve({ guesses: [...misses, g], cluesSeen: revealed }, misses.length);
      return;
    }
    misses.push(g);
    const more = revealed < p.clues.length;
    if (more) {
      revealed++;
      fresh = revealed - 1;
    }
    feedback.textContent = more ? "Not quite. Here's another clue." : 'Not quite. Keep guessing.';
    feedback.className = 'feedback bad';
    input.value = '';
    shake(form);
    props.save({ guesses: misses, revealed });
    render();
    input.focus();
  }

  render();
  if (solved) {
    return {
      el: h(
        'div',
        null,
        clues,
        h('p', null, 'The link'),
        h('p', { class: 'answer' }, p.answer),
        missesEl,
      ),
    };
  }
  return { el: h('div', null, clues, form, feedback, missesEl) };
}
