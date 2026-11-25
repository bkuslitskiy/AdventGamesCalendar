export interface GameProps<P, W, B> {
  puzzle: P;
  rev: string;
  /** Saved in-progress state for this puzzle revision, if any. */
  wip: W | null;
  save(wip: W): void;
  /** Set when showing an already solved puzzle (read-only). */
  solved: B | null;
  onSolve(board: B, attempts: number): void;
}

export interface GameView {
  el: HTMLElement;
  destroy?(): void;
}

/** Riso ink set for found Wend words, in order found. */
export const INKS = ['#4a90ff', '#ff5fae', '#ffcc29', '#2fc49b', '#ff8a3d', '#9d7bff', '#47cfe0', '#ff6464'];

export const fill = (ink: string, pct = 62): string => `color-mix(in srgb, ${ink} ${pct}%, var(--mix))`;
