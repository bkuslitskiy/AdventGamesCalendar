import { h, mount, shake } from '../dom.ts';
import { clean, endFits, isLadder, oneApart } from '../../core/crossclimb.ts';
import { shuffled } from '../../core/rand.ts';
import type { CrossclimbBoard, CrossclimbPuzzle } from '../../core/types.ts';
import type { GameProps, GameView } from './types.ts';
import { BACK, keyboard } from './keyboard.ts';

export interface CrossclimbWip {
  entries: Record<number, string>;
  order: number[];
  top: string;
  bottom: string;
  attempts: number;
}

export const CROSSCLIMB_HOWTO =
  'Answer each clue. Then arrange the words into a ladder where each changes one letter from the next. Last, fill in the top and bottom.';

type Phase = 'fill' | 'arrange' | 'ends' | 'done';
type RowId = number | 'top' | 'bottom';

/**
 * Typing goes through the shared on-screen keyboard, never a text input, so the phone's own keyboard
 * never opens. The clue, feedback and keys sit together in a dock pinned to the bottom of the screen,
 * so the clue stays in view however long the ladder is.
 */
export function crossclimbGame(props: GameProps<CrossclimbPuzzle, CrossclimbWip, CrossclimbBoard>): GameView {
  const p = props.puzzle;
  const L = p.length;
  const words = p.rungs.map((r) => r.word);
  const solved = props.solved;
  const w = props.wip;

  let order = solved ? solved.order.slice() : w?.order?.length === words.length ? w.order.slice() : shuffled(words.map((_, i) => i), props.rev);
  const entries: Record<number, string> = solved ? Object.fromEntries(words.map((x, i) => [i, x])) : { ...(w?.entries ?? {}) };
  let top = solved ? solved.top : w?.top ?? '';
  let bottom = solved ? solved.bottom : w?.bottom ?? '';
  let attempts = w?.attempts ?? 0;
  let selected: number | null = null;

  const orderWords = () => order.map((i) => words[i]!);
  const rungDone = (i: number) => entries[i] === words[i];
  const topOk = () => endFits(p, orderWords(), 'top', top, bottom);
  const bottomOk = () => endFits(p, orderWords(), 'bottom', bottom, top);

  function phase(): Phase {
    if (solved) return 'done';
    if (!words.every((_, i) => rungDone(i))) return 'fill';
    if (!isLadder(orderWords())) return 'arrange';
    if (!(topOk() && bottomOk())) return 'ends';
    return 'done';
  }

  /** Rows that take typing right now, top to bottom. */
  function editable(): RowId[] {
    const ph = phase();
    if (ph === 'fill') return order.filter((i) => !rungDone(i));
    if (ph === 'ends') return [...(topOk() ? [] : ['top' as const]), ...(bottomOk() ? [] : ['bottom' as const])];
    return [];
  }
  let active: RowId | null = editable()[0] ?? null;

  const valueOf = (id: RowId): string => (id === 'top' ? top : id === 'bottom' ? bottom : entries[id] ?? '');
  function setValue(id: RowId, v: string): void {
    if (id === 'top') top = v;
    else if (id === 'bottom') bottom = v;
    else entries[id] = v;
  }

  const ladder = h('div', { class: 'ladder' });
  const clue = h('div', { class: 'clue', role: 'status' });
  const feedback = h('p', { class: 'feedback', role: 'status' });
  const kb = solved ? null : keyboard({ onKey, onOther });
  const dock = solved ? null : h('div', { class: 'dock' }, clue, feedback, kb!.el);
  // display: contents, so the dock sticks against the whole page, not just the game's own box (which
  // starts below the fold on a small phone).
  const root = h('div', { class: 'cc' }, ladder, dock ?? feedback);

  const persist = () => props.save({ entries, order, top, bottom, attempts });

  function boxes(value: string, focused: boolean): HTMLElement {
    return h(
      'div',
      { class: 'boxes', 'aria-hidden': 'true' },
      Array.from({ length: L }, (_, i) =>
        h('div', { class: ['box', focused && i === Math.min(value.length, L - 1) && 'cursor'] }, value[i] ?? ''),
      ),
    );
  }

  function typingRow(id: RowId, label: string): HTMLElement {
    const value = valueOf(id);
    const on = active === id;
    return h(
      'div',
      {
        class: ['rung', 'typing', on && 'active'],
        'data-row': String(id),
        role: 'button',
        tabindex: '0',
        'aria-pressed': on ? 'true' : 'false',
        'aria-label': `${label}: ${value ? value.split('').join(' ') : 'empty'}`,
        onclick: (ev: MouseEvent) => {
          if (active === id) return;
          const hadFocus = document.activeElement === ev.currentTarget;
          active = id;
          render();
          // Keep keyboard focus on the row it was on (render rebuilt it).
          if (hadFocus) ladder.querySelector<HTMLElement>(`[data-row="${id}"]`)?.focus();
        },
      },
      boxes(value, on),
    );
  }

  function fixedRow(value: string, cls: string[], link?: boolean | null, onClick?: () => void): HTMLElement {
    return h(
      'div',
      { class: ['rung', ...cls, onClick && 'tappable'], onclick: onClick, role: onClick ? 'button' : undefined, tabindex: onClick ? '0' : undefined },
      link == null ? null : h('span', { class: ['link', link && 'ok'] }),
      boxes(value, false),
    );
  }

  function miss(id: RowId): void {
    attempts++;
    persist();
    const row = ladder.querySelector<HTMLElement>(`[data-row="${id}"]`);
    if (row) shake(row);
    feedback.textContent = 'Not that one.';
    feedback.className = 'feedback bad';
  }

  function showClue(): void {
    const ph = phase();
    if (ph === 'fill') {
      clue.textContent = typeof active === 'number' ? p.rungs[active]!.clue : 'Tap a row to see its clue.';
    } else if (ph === 'arrange') {
      clue.textContent = 'Arrange the words so each changes one letter from the next. Tap two words to swap them.';
    } else {
      clue.textContent = `Top and bottom: ${p.ends.clue}`;
    }
  }

  function nextOpen(after: number): number | null {
    const pos = order.indexOf(after);
    for (let k = 1; k <= order.length; k++) {
      const i = order[(pos + k) % order.length]!;
      if (!rungDone(i)) return i;
    }
    return null;
  }

  /** Bring the active row into view above the dock (on open, and after typing moved it; not after a tap). */
  function reveal(smooth = true): void {
    if (!dock?.isConnected) return;
    root.style.setProperty('--dock-h', `${dock.offsetHeight}px`);
    const still = !smooth || matchMedia('(prefers-reduced-motion: reduce)').matches;
    ladder.querySelector('.rung.active')?.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }

  function render(): void {
    const ph = phase();
    const rows: HTMLElement[] = [];
    const ow = orderWords();
    const linkAt = (pos: number) => (ph === 'fill' || pos === 0 ? null : oneApart(ow[pos - 1]!, ow[pos]!));

    // Top end
    if (ph === 'ends' && !topOk()) rows.push(typingRow('top', 'Top word'));
    else if (ph === 'ends' || ph === 'done') rows.push(fixedRow(top, ['end', 'correct']));
    else rows.push(fixedRow('', ['end', 'locked']));

    order.forEach((i, pos) => {
      if (ph === 'fill' && !rungDone(i)) {
        rows.push(typingRow(i, `Rung ${pos + 1}`));
      } else if (ph === 'arrange') {
        rows.push(
          fixedRow(words[i]!, ['correct', selected === pos && 'selected'].filter(Boolean) as string[], linkAt(pos), () => {
            if (selected === null) selected = pos;
            else if (selected === pos) selected = null;
            else {
              [order[selected], order[pos]] = [order[pos]!, order[selected]!];
              selected = null;
              persist();
            }
            after();
          }),
        );
      } else {
        rows.push(fixedRow(words[i]!, ['correct'], linkAt(pos)));
      }
    });

    // Bottom end
    if (ph === 'ends' && !bottomOk()) rows.push(typingRow('bottom', 'Bottom word'));
    else if (ph === 'ends' || ph === 'done') rows.push(fixedRow(bottom, ['end', 'correct']));
    else rows.push(fixedRow('', ['end', 'locked']));

    mount(ladder, rows);
    if (kb) kb.el.hidden = ph !== 'fill' && ph !== 'ends';
    showClue();
  }

  /** Re-render after a change, keeping a typing row active while there is one, and finish on a solve. */
  function after(next: RowId | null = active): void {
    const open = editable();
    active = next !== null && open.includes(next) ? next : open[0] ?? null;
    render();
    if (phase() === 'done' && !solved) {
      kb?.destroy();
      props.onSolve({ order: order.slice(), top, bottom }, attempts);
      return;
    }
    reveal();
  }

  function onKey(k: string): void {
    if (active === null) return;
    const id = active;
    const before = valueOf(id);
    if (k === BACK) {
      if (!before) return;
      setValue(id, before.slice(0, -1));
      persist();
      render();
      return;
    }
    // A full row is always a wrong one (right answers lock), so typing starts it over.
    const v = clean(before.length >= L ? k : before + k).slice(0, L);
    setValue(id, v);
    persist();
    if (v.length < L) {
      render();
      return;
    }
    if (typeof id === 'number') {
      if (v === words[id]) {
        feedback.textContent = '';
        feedback.className = 'feedback';
        persist();
        after(nextOpen(id));
      } else {
        render();
        miss(id);
      }
    } else if (id === 'top' ? topOk() : bottomOk()) {
      feedback.textContent = '';
      feedback.className = 'feedback';
      after(null);
    } else {
      render();
      miss(id);
    }
  }

  /** Physical keys beyond letters: arrows move between typing rows; Enter or Space presses a focused row. */
  function onOther(ev: KeyboardEvent): boolean {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      const open = editable();
      if (!open.length) return false;
      const at = active === null ? -1 : open.indexOf(active);
      const step = ev.key === 'ArrowDown' ? 1 : -1;
      active = open[(at + step + open.length) % open.length]!;
      render();
      reveal();
      return true;
    }
    const t = ev.target as HTMLElement | null;
    if ((ev.key === 'Enter' || ev.key === ' ') && t?.classList.contains('rung') && t.getAttribute('role') === 'button') {
      t.click();
      return true;
    }
    return false;
  }

  render();
  // The page mounts this and scrolls to the top first; then, on a short screen, scroll just enough that
  // the row being typed isn't hidden behind the dock.
  if (dock) requestAnimationFrame(() => reveal(false));
  return { el: root, destroy: () => kb?.destroy() };
}
