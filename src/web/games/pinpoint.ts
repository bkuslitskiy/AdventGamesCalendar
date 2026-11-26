import { h, mount, shake } from '../dom.ts';
import { GUESS_MAX, judge, PINPOINT_EXTRA, pinpointStage, type PinpointStage } from '../../core/pinpoint.ts';
import type { PinpointBoard, PinpointPuzzle } from '../../core/types.ts';
import type { GameProps, GameView } from './types.ts';
import type { RemoteVerdict } from '../api.ts';

export interface PinpointWip {
  guesses: string[];
  revealed: number;
  /** Answer offers turned down. Missing in state saved before offers existed (treated as 0). */
  declined?: number;
}

export const PINPOINT_HOWTO = 'Five clues share a link. Name it in as few clues as you can; each miss reveals the next clue.';

const EXTRA = PINPOINT_EXTRA === 2 ? 'Two' : String(PINPOINT_EXTRA);

/** What's left before the next offer or the cut-off. */
function ahead(st: Extract<PinpointStage, { kind: 'extra' }>): string {
  if (st.left === 1) return st.final ? 'Last guess.' : 'One more guess, then I’ll ask again.';
  return `${st.left === 2 ? 'Two' : st.left} more guesses, then ${st.final ? 'that’s it' : 'I’ll ask again'}.`;
}

/** Feedback after a miss. Offers carry their own text. */
function missText(st: PinpointStage): string {
  if (st.kind === 'clue') return "Not quite. Here's another clue.";
  return st.kind === 'extra' ? `Not quite. ${ahead(st)}` : '';
}

export interface PinpointProps extends GameProps<PinpointPuzzle, PinpointWip, PinpointBoard> {
  /** Second opinion from the server's AI judge on a guess the word matcher rejected. */
  remote?: (guess: string) => Promise<RemoteVerdict>;
}

export function pinpointGame(props: PinpointProps): GameView {
  const p = props.puzzle;
  const solved = props.solved;
  const misses: string[] = solved
    ? solved.answerShown
      ? solved.guesses.slice()
      : solved.guesses.slice(0, -1)
    : (props.wip?.guesses ?? []).slice();
  let revealed = solved ? solved.cluesSeen : props.wip?.revealed ?? 1;
  let declined = props.wip?.declined ?? 0;
  let fresh = -1;
  let ended = false;
  let busy = false;
  const stage = (): PinpointStage => pinpointStage(p.clues.length, misses.length, declined);

  const clues = h('ol', { class: 'clues' });
  const feedback = h('p', { class: 'feedback', role: 'status' });
  const missesEl = h('p', { class: 'misses' });
  const controls = h('div', { class: 'controls' });
  const input = h('input', {
    type: 'text',
    name: 'guess',
    placeholder: 'What links them?',
    autocomplete: 'off',
    autocapitalize: 'none',
    spellcheck: 'false',
    enterkeyhint: 'go',
    maxlength: GUESS_MAX,
    'aria-label': 'Your guess',
  });
  const submit = h('button', { class: 'btn', type: 'submit' }, 'Guess');
  const form = h(
    'form',
    {
      class: 'guess',
      onsubmit: (ev: Event) => {
        ev.preventDefault();
        void guess(input.value.trim());
      },
    },
    input,
    submit,
  );
  const offerText = h('div', { class: 'ask' });
  const showBtn = h('button', { class: 'btn', type: 'button', onclick: () => end('asked') }, 'Show me');
  const offer = h(
    'div',
    { class: 'offer', role: 'group', 'aria-label': 'Show the answer?' },
    offerText,
    h('div', { class: 'actions' }, showBtn, h('button', { class: 'btn ghost', type: 'button', onclick: decline }, `${EXTRA} more guesses`)),
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
    const st = stage();
    if (st.kind === 'offer') {
      mount(
        offerText,
        st.nth === 1
          ? [h('p', { class: 'bad' }, 'Not quite, and that was the last clue.'), h('p', null, 'Want the answer?')]
          : [h('p', { class: 'bad' }, 'Still not it.'), h('p', null, st.last ? `Want the answer now? ${EXTRA} more guesses and you’re cut off.` : 'Want the answer now?')],
      );
    }
    mount(controls, st.kind === 'offer' ? offer : form);
  }

  function save(): void {
    props.save({ guesses: misses, revealed, declined });
  }

  function end(how: 'asked' | 'cutoff'): void {
    if (ended) return;
    ended = true;
    props.onSolve({ guesses: misses.slice(), cluesSeen: revealed, answerShown: how }, misses.length);
  }

  function solve(g: string, ai: boolean): void {
    ended = true;
    props.onSolve({ guesses: [...misses, g], cluesSeen: revealed, ...(ai ? { aiAccepted: true as const } : {}) }, misses.length);
  }

  /** Keeps the phone keyboard up (readOnly, not disabled) while the AI judge thinks. */
  function checking(on: boolean): void {
    busy = on;
    input.readOnly = on;
    (submit as HTMLButtonElement).disabled = on;
    submit.textContent = on ? 'Checking…' : 'Guess';
  }

  async function guess(g: string): Promise<void> {
    if (!g || ended || busy) return;
    if (judge(g, p) === 'correct') return solve(g, false);
    if (props.remote) {
      checking(true);
      const v = await props.remote(g).catch((): RemoteVerdict => 'unavailable');
      checking(false);
      if (ended) return;
      if (v === 'correct') return solve(g, true);
    }
    miss(g);
  }

  function miss(g: string): void {
    misses.push(g);
    if (revealed < p.clues.length) {
      revealed++;
      fresh = revealed - 1;
    } else {
      fresh = -1;
    }
    const st = stage();
    if (st.kind === 'cutoff') {
      save();
      end('cutoff');
      return;
    }
    feedback.textContent = missText(st);
    feedback.className = 'feedback bad';
    input.value = '';
    save();
    render();
    if (st.kind === 'offer') {
      shake(offer);
      showBtn.focus();
    } else {
      shake(form);
      input.focus();
    }
  }

  function decline(): void {
    const st = stage();
    if (st.kind !== 'offer' || ended) return;
    declined = st.nth;
    const next = stage();
    feedback.textContent = next.kind === 'extra' ? ahead(next) : '';
    feedback.className = 'feedback';
    fresh = -1;
    save();
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
  // Saved state already past the last guess (only possible from before the cut-off existed).
  if (stage().kind === 'cutoff') setTimeout(() => end('cutoff'), 0);
  return { el: h('div', null, clues, controls, feedback, missesEl) };
}
