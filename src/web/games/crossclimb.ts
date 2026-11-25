import { h, mount, shake } from '../dom.ts';
import { clean, endFits, isLadder, oneApart } from '../../core/crossclimb.ts';
import { shuffled } from '../../core/rand.ts';
import type { CrossclimbBoard, CrossclimbPuzzle } from '../../core/types.ts';
import type { GameProps, GameView } from './types.ts';

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
  let active: RowId | null = null;

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

  const ladder = h('div', { class: 'ladder' });
  const clue = h('div', { class: 'clue', role: 'status' });
  const feedback = h('p', { class: 'feedback', role: 'status' });

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

  function inputRow(id: RowId, value: string, label: string, onFull: (v: string, row: HTMLElement) => void): HTMLElement {
    const row = h('div', { class: 'rung', 'data-row': String(id) });
    const input = h('input', {
      type: 'text',
      value,
      maxlength: String(L),
      autocomplete: 'off',
      autocapitalize: 'characters',
      spellcheck: 'false',
      enterkeyhint: 'next',
      'aria-label': label,
    });
    const paint = () => {
      row.querySelector('.boxes')?.replaceWith(boxes(input.value, document.activeElement === input));
    };
    input.addEventListener('focus', () => {
      active = id;
      showClue();
      paint();
    });
    input.addEventListener('blur', paint);
    input.addEventListener('input', () => {
      const v = clean(input.value).slice(0, L);
      input.value = v;
      if (typeof id === 'number') entries[id] = v;
      else if (id === 'top') top = v;
      else bottom = v;
      paint();
      persist();
      if (v.length === L) onFull(v, row);
    });
    row.append(boxes(value, false), input);
    return row;
  }

  function fixedRow(value: string, cls: string[], link?: boolean | null, onClick?: () => void): HTMLElement {
    return h(
      'div',
      { class: ['rung', ...cls, onClick && 'tappable'], onclick: onClick, role: onClick ? 'button' : undefined, tabindex: onClick ? '0' : undefined },
      link == null ? null : h('span', { class: ['link', link && 'ok'] }),
      boxes(value, false),
    );
  }

  function miss(row: HTMLElement): void {
    attempts++;
    persist();
    shake(row);
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

  function focusRow(id: RowId | null): void {
    if (id === null) return;
    const el = ladder.querySelector<HTMLInputElement>(`[data-row="${id}"] input`);
    el?.focus();
  }

  function nextOpen(after: number): number | null {
    const pos = order.indexOf(after);
    for (let k = 1; k <= order.length; k++) {
      const i = order[(pos + k) % order.length]!;
      if (!rungDone(i)) return i;
    }
    return null;
  }

  function render(): void {
    const ph = phase();
    const rows: HTMLElement[] = [];
    const ow = orderWords();
    const linkAt = (pos: number) => (ph === 'fill' || pos === 0 ? null : oneApart(ow[pos - 1]!, ow[pos]!));

    // Top end
    if (ph === 'ends' && !topOk()) {
      rows.push(
        inputRow('top', top, 'Top word', (v, row) => {
          if (topOk()) after();
          else if (v.length === L) miss(row);
        }),
      );
    } else if (ph === 'ends' || ph === 'done') {
      rows.push(fixedRow(top, ['end', 'correct']));
    } else {
      rows.push(fixedRow('', ['end', 'locked']));
    }

    order.forEach((i, pos) => {
      if (ph === 'fill' && !rungDone(i)) {
        rows.push(
          inputRow(i, entries[i] ?? '', `Rung ${pos + 1}`, (v, row) => {
            if (v === words[i]) {
              feedback.textContent = '';
              persist();
              const next = nextOpen(i);
              after(next);
            } else miss(row);
          }),
        );
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
    if (ph === 'ends' && !bottomOk()) {
      rows.push(
        inputRow('bottom', bottom, 'Bottom word', (v, row) => {
          if (bottomOk()) after();
          else if (v.length === L) miss(row);
        }),
      );
    } else if (ph === 'ends' || ph === 'done') {
      rows.push(fixedRow(bottom, ['end', 'correct']));
    } else {
      rows.push(fixedRow('', ['end', 'locked']));
    }
    mount(ladder, rows);
    showClue();
  }

  function after(focus: RowId | null = active): void {
    const before = phase();
    render();
    const ph = phase();
    if (ph === 'done' && !solved) {
      props.onSolve({ order: order.slice(), top, bottom }, attempts);
      return;
    }
    if (ph === 'ends' && before !== 'ends') focusRow(topOk() ? 'bottom' : 'top');
    else if (ph === 'ends') focusRow(topOk() ? 'bottom' : 'top');
    else if (ph === 'fill') focusRow(focus);
  }

  render();
  return { el: h('div', null, ladder, solved ? null : clue, feedback) };
}
