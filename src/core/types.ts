/** Shared types and constants. Imported by the browser app, the Pages Functions and the tools. */

/** Every game id, in the order games are listed on a day. */
export const ALL_GAMES = ['wend', 'pinpoint', 'crossclimb', 'connections', 'mini', 'wordle', 'queens', 'patches'] as const;
export type GameId = (typeof ALL_GAMES)[number];

/** Games expected every day. Queens and Patches join in phase 2. */
export const EXPECTED_GAMES: GameId[] = ['wend', 'pinpoint', 'crossclimb', 'connections', 'mini', 'wordle'];

export const GAME_NAMES: Record<GameId, string> = {
  wend: 'Wend',
  pinpoint: 'Pinpoint',
  crossclimb: 'Crossclimb',
  connections: 'Connections',
  mini: 'Mini',
  wordle: 'Wordle',
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

export interface ConnectionsGroup {
  /** Shown once the group is found. */
  name: string;
  words: string[];
}
export interface ConnectionsPuzzle {
  /** Exactly four groups of four, easiest first (they're coloured yellow, green, blue, purple). */
  groups: ConnectionsGroup[];
}

export interface MiniClues {
  /** Keyed by clue number, e.g. { "1": "...", "5": "..." }. */
  across: Record<string, string>;
  down: Record<string, string>;
}
export interface MiniPuzzle {
  /** One string per row. Letters A–Z; `#` is a black square. */
  grid: string[];
  clues: MiniClues;
}

export interface WordlePuzzle {
  /** 4–7 letters, A–Z. Its length sets the row width. */
  answer: string;
  /** Extra guesses to accept on top of the word list (names, slang). Same length as the answer. */
  allowed?: string[];
}

export interface PuzzleDataMap {
  wend: WendPuzzle;
  pinpoint: PinpointPuzzle;
  crossclimb: CrossclimbPuzzle;
  connections: ConnectionsPuzzle;
  mini: MiniPuzzle;
  wordle: WordlePuzzle;
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
  /** Every guess in order. The last one is the answer, unless `answerShown` is set (then all are misses). */
  guesses: string[];
  cluesSeen: number;
  /** Set when the game ended by showing the answer: the player asked for it, or ran out of guesses. */
  answerShown?: 'asked' | 'cutoff';
}

export const pinpointShown = (board: unknown): PinpointBoard['answerShown'] =>
  (board as PinpointBoard | null)?.answerShown;
export interface CrossclimbBoard {
  /** Rung indices from top to bottom as arranged. */
  order: number[];
  top: string;
  bottom: string;
}

export interface ConnectionsBoard {
  /** Group indices in the order found. */
  order: number[];
  /** Every submitted guess, in order. */
  guesses: string[][];
}
export interface MiniBoard {
  /** The finished grid, one string per row (`#` for black squares). */
  grid: string[];
}
export interface WordleBoard {
  /** Every guess in order; the last one is the answer. */
  guesses: string[];
}

export interface Stats {
  /** Active milliseconds spent on the puzzle. */
  ms: number;
  /** Wrong submissions. */
  attempts: number;
}

export interface SolvePayload {
  board: WendBoard | PinpointBoard | CrossclimbBoard | ConnectionsBoard | MiniBoard | WordleBoard;
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
  /** Pre-launch testing: every day is open until Day 1 opens. */
  early: boolean;
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
