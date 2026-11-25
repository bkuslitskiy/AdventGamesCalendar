/** Shared types and constants. Imported by the browser app, the Pages Functions and the tools. */

export const ALL_GAMES = ['wend', 'pinpoint', 'crossclimb', 'queens', 'patches'] as const;
export type GameId = (typeof ALL_GAMES)[number];

/** Games expected every day. Queens and Patches join in phase 2. */
export const EXPECTED_GAMES: GameId[] = ['wend', 'pinpoint', 'crossclimb'];

export const GAME_NAMES: Record<GameId, string> = {
  wend: 'Wend',
  pinpoint: 'Pinpoint',
  crossclimb: 'Crossclimb',
  queens: 'Queens',
  patches: 'Patches',
};

export const isGameId = (v: unknown): v is GameId =>
  typeof v === 'string' && (ALL_GAMES as readonly string[]).includes(v);

/** [row, col] */
export type Cell = [number, number];

export interface WendWord {
  word: string;
  path: Cell[];
}
export interface WendPuzzle {
  /** One string per row. Letters A–Z; `#` is a wall. */
  grid: string[];
  words: WendWord[];
  theme?: string;
}

export interface PinpointPuzzle {
  clues: string[];
  answer: string;
  aliases?: string[];
  reject?: string[];
  tests?: { accept?: string[]; reject?: string[] };
}

export interface CrossclimbPuzzle {
  length: number;
  /** Middle rungs in a valid ladder order. */
  rungs: { word: string; clue: string }[];
  ends: { top: string; bottom: string; clue: string };
}

export interface PuzzleDataMap {
  wend: WendPuzzle;
  pinpoint: PinpointPuzzle;
  crossclimb: CrossclimbPuzzle;
  queens: unknown;
  patches: unknown;
}

export interface PublishedPuzzle<G extends GameId = GameId> {
  game: G;
  /** Content hash of the puzzle data (first 12 hex of SHA-256). */
  rev: string;
  /** ISO time after which a solve counts as late. */
  deadline: string;
  data: PuzzleDataMap[G];
}

export type DayPuzzles = { [G in GameId]?: PublishedPuzzle<G> };

export interface DayContent {
  afterword?: string;
  puzzles: DayPuzzles;
}

export type ContentBundle = Record<number, DayContent>;

// ---- Solves ----

export interface WendBoard {
  /** Word indices in the order found. */
  order: number[];
}
export interface PinpointBoard {
  guesses: string[];
  cluesSeen: number;
}
export interface CrossclimbBoard {
  /** Rung indices from top to bottom as arranged. */
  order: number[];
  top: string;
  bottom: string;
}

export interface Stats {
  /** Active milliseconds spent on the puzzle. */
  ms: number;
  /** Wrong submissions. */
  attempts: number;
}

export interface SolvePayload {
  board: WendBoard | PinpointBoard | CrossclimbBoard;
  stats: Stats;
}

export interface SolveRecord {
  day: number;
  game: GameId;
  rev: string;
  tsClient: string;
  late: boolean;
  payload: SolvePayload;
}

export type SolveKey = `${number}:${GameId}`;
export const solveKey = (day: number, game: GameId): SolveKey => `${day}:${game}`;

// ---- API shapes ----

export interface StateDay {
  n: number;
  opensAt: string;
  open: boolean;
  games: GameId[];
}

export interface StateResponse {
  now: string;
  today: number;
  days: StateDay[];
  expected: GameId[];
}

export interface DayResponse {
  n: number;
  opensAt: string;
  afterword?: string;
  puzzles: DayPuzzles;
}

export interface ProgressResponse {
  solves: SolveRecord[];
}

export interface EventInput {
  type: 'identify' | 'solve';
  clientId: string;
  device: string;
  tsClient: string;
  day?: number;
  game?: GameId;
  rev?: string;
  payload?: SolvePayload;
}

export interface LogEvent {
  id: number;
  type: 'identify' | 'solve' | 'reset' | 'void';
  day: number | null;
  game: GameId | null;
  rev: string | null;
  tsClient: string | null;
  tsServer: string;
  device: string;
  payload: unknown;
}
