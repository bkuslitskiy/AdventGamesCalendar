import { h } from '../dom.ts';

/**
 * On-screen QWERTY keyboard shared by Wordle and the Mini, plus physical-keyboard input.
 * The phone's own keyboard never opens, so the grid stays in view.
 */

export const ENTER = 'Enter';
export const BACK = 'Backspace';

export interface KeyboardOptions {
  onKey(key: string): void;
  /** Show an Enter key with this label. */
  enter?: string;
  /** Other physical keys (arrows, Tab, space). Return true if handled. */
  onOther?(ev: KeyboardEvent): boolean;
}

export interface Keyboard {
  el: HTMLElement;
  /** Set a class per letter (Wordle's hit / near / miss). */
  paint(states: Record<string, string>): void;
  destroy(): void;
}

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

export function keyboard(opts: KeyboardOptions): Keyboard {
  const keys = new Map<string, HTMLButtonElement>();
  const key = (k: string, label: string, cls?: string, aria?: string): HTMLButtonElement => {
    const b = h('button', { type: 'button', class: ['key', cls], 'data-key': k, 'aria-label': aria ?? label }, label);
    // Taps don't move focus onto the key, so a physical space or Enter never re-presses it.
    b.addEventListener('pointerdown', (ev) => ev.preventDefault());
    b.addEventListener('click', () => opts.onKey(k));
    keys.set(k, b);
    return b;
  };
  const el = h(
    'div',
    { class: 'kb', role: 'group', 'aria-label': 'Keyboard' },
    ROWS.map((row, i) =>
      h(
        'div',
        { class: 'kb-row' },
        i === 2 && opts.enter ? key(ENTER, opts.enter, 'wide') : null,
        [...row].map((ch) => key(ch, ch)),
        i === 2 ? key(BACK, '⌫', 'wide', 'Delete') : null,
      ),
    ),
  );

  const onKeydown = (ev: KeyboardEvent) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const t = ev.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (/^[a-z]$/i.test(ev.key)) {
      ev.preventDefault();
      opts.onKey(ev.key.toUpperCase());
    } else if (ev.key === 'Backspace' || ev.key === 'Delete') {
      ev.preventDefault();
      opts.onKey(BACK);
    } else if (ev.key === 'Enter' && opts.enter) {
      // Let Enter activate a focused button (e.g. a clue) instead of submitting.
      if (t && t.tagName === 'BUTTON' && !t.classList.contains('key')) return;
      ev.preventDefault();
      opts.onKey(ENTER);
    } else if (opts.onOther?.(ev)) {
      ev.preventDefault();
    }
  };
  document.addEventListener('keydown', onKeydown);

  return {
    el,
    paint(states) {
      for (const [k, b] of keys) {
        b.classList.remove('hit', 'near', 'miss');
        const s = states[k];
        if (s) b.classList.add(s);
      }
    },
    destroy() {
      document.removeEventListener('keydown', onKeydown);
    },
  };
}
