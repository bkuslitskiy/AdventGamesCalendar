import { h, type Child } from '../dom.ts';

/**
 * A dock pinned to the bottom of the screen (position: sticky) for a game's keys, clue, feedback or buttons,
 * so they stay in reach while the board sits above. Crossclimb, Wordle, the Mini and Connections use it.
 *
 * Put `el` last inside a `display: contents` game root (class `docked`), so it sticks against the whole page
 * rather than the game's own box, which starts below the fold on a small phone. The dock keeps `--dock-h` on
 * its parent current, and the CSS uses it for `scroll-margin` and to size boards to the space above the dock.
 */
export interface Dock {
  el: HTMLElement;
  /** Scroll `target` just far enough to sit in view above the dock (no-op if it already does). */
  reveal(target: Element | null | undefined, smooth?: boolean): void;
  destroy(): void;
}

export function dock(children: Child[], onResize?: () => void): Dock {
  const el = h('div', { class: 'dock' }, children);
  let last = -1;
  const measure = (): boolean => {
    const height = el.offsetHeight;
    if (!el.isConnected || height === last) return false;
    last = height;
    el.parentElement?.style.setProperty('--dock-h', `${height}px`);
    return true;
  };
  // Rotation, a wrapped feedback line or the keys hiding all change the dock's height.
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure() && onResize?.());
  ro?.observe(el);

  return {
    el,
    reveal(target, smooth = true) {
      if (!el.isConnected || !target) return;
      measure();
      const still = !smooth || matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
    },
    destroy() {
      ro?.disconnect();
    },
  };
}
