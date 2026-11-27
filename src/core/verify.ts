import { blocksAi, GUESS_MAX, judge } from './pinpoint.ts';
import { clean as rungClean, isLadder } from './crossclimb.ts';
import { guessKey } from './connections.ts';
import { isSolved, MAX_SIZE } from './mini.ts';
import { clean as wordClean, MAX_LEN } from './wordle.ts';
import { SQUARES, solution, startTiles, swap } from './hashtag.ts';
import type {
  ConnectionsBoard,
  ConnectionsPuzzle,
  CrossclimbBoard,
  CrossclimbPuzzle,
  GameId,
  HashtagBoard,
  HashtagPuzzle,
  MiniBoard,
  MiniPuzzle,
  PinpointBoard,
  PinpointPuzzle,
  SolvePayload,
  Stats,
  WendBoard,
  WendPuzzle,
  WordleBoard,
  WordlePuzzle,
} from './types.ts';

/**
 * Server-side check of a solve before it goes in babe's log. The board must have the shape its game
 * records, and, when it was played on the puzzle's current revision, it must actually solve that puzzle.
 * A board from an older revision (the puzzle was edited while the solve sat in the outbox) only has its
 * shape checked, because it can't be replayed against puzzle data that has since changed.
 *
 * The returned payload is rebuilt from the checked fields, so nothing else a client sends is stored.
 * The list caps are far above anything real play produces; they only bound what a request can store.
 */

export const CAPS = {
  /** Body size of POST /api/events. */
  bodyBytes: 20_000,
  pinpointGuesses: 20,
  connectionsGuesses: 150,
  wordleGuesses: 300,
  hashtagSwaps: 1000,
  /** Word and rung indices. */
  indices: 100,
  /** Longest a single solve can take: the whole of December. */
  ms: 31 * 24 * 3600_000,
  attempts: 100_000,
} as const;

export type Checked = { ok: true; payload: SolvePayload } | { ok: false; error: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const strList = (v: unknown, maxLen: number, maxItems: number): v is string[] =>
  Array.isArray(v) && v.length <= maxItems && v.every((x) => isStr(x, maxLen));
const indexList = (v: unknown, max: number): v is number[] =>
  Array.isArray(v) && v.length <= CAPS.indices && v.every((x) => isInt(x, 0, max)) && new Set(v).size === v.length;
/** Every index 0..n-1 exactly once (indexList already rules out repeats). */
const covers = (xs: number[], n: number): boolean => xs.length === n && xs.every((x) => x < n);

type BoardResult<B> = B | string;

function checkStats(v: unknown): Stats | string {
  if (!isObj(v)) return 'bad stats';
  const { ms, attempts } = v;
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0 || ms > CAPS.ms) return 'bad stats.ms';
  if (!isInt(attempts, 0, CAPS.attempts)) return 'bad stats.attempts';
  return { ms: Math.round(ms), attempts };
}

function wend(p: WendPuzzle, b: Obj, current: boolean): BoardResult<WendBoard> {
  if (!indexList(b.order, CAPS.indices - 1)) return 'bad order';
  if (current && !covers(b.order, p.words.length)) return 'not every word was found';
  return { order: b.order.slice() };
}

function pinpoint(p: PinpointPuzzle, b: Obj, current: boolean): BoardResult<PinpointBoard> {
  const { guesses, cluesSeen, answerShown, aiAccepted } = b;
  if (!strList(guesses, GUESS_MAX, CAPS.pinpointGuesses)) return 'bad guesses';
  if (!isInt(cluesSeen, 0, 10)) return 'bad cluesSeen';
  if (answerShown !== undefined && answerShown !== 'asked' && answerShown !== 'cutoff') return 'bad answerShown';
  if (aiAccepted !== undefined && aiAccepted !== true) return 'bad aiAccepted';
  if (answerShown && aiAccepted) return 'a shown answer is not an AI solve';
  if (current) {
    if (cluesSeen > p.clues.length) return 'bad cluesSeen';
    if (!answerShown) {
      const last = guesses[guesses.length - 1];
      if (last === undefined) return 'no winning guess';
      // The AI judge never overrules the author's reject lists, so neither can a board that says it did.
      const right = aiAccepted ? !blocksAi(last, p) : judge(last, p) === 'correct';
      if (!right) return 'the last guess is not the answer';
    }
  }
  return {
    guesses: guesses.slice(),
    cluesSeen,
    ...(answerShown ? { answerShown } : {}),
    ...(aiAccepted ? { aiAccepted: true as const } : {}),
  };
}

function crossclimb(p: CrossclimbPuzzle, b: Obj, current: boolean): BoardResult<CrossclimbBoard> {
  const { order, top, bottom } = b;
  if (!indexList(order, CAPS.indices - 1)) return 'bad order';
  if (!isStr(top, 64) || !isStr(bottom, 64)) return 'bad ends';
  if (current) {
    if (!covers(order, p.rungs.length)) return 'not every rung is placed';
    const [t, u] = [rungClean(top), rungClean(bottom)];
    const ends = [rungClean(p.ends.top), rungClean(p.ends.bottom)].sort();
    if ([t, u].sort().join() !== ends.join()) return 'the ends are not the end words';
    if (!isLadder([t, ...order.map((i) => p.rungs[i]!.word), u])) return 'not a ladder';
  }
  return { order: order.slice(), top, bottom };
}

function connections(p: ConnectionsPuzzle, b: Obj, current: boolean): BoardResult<ConnectionsBoard> {
  const { order, guesses } = b;
  if (!indexList(order, 3)) return 'bad order';
  if (!Array.isArray(guesses) || guesses.length > CAPS.connectionsGuesses || !guesses.every((g) => strList(g, 40, 4))) return 'bad guesses';
  if (current) {
    if (!covers(order, p.groups.length)) return 'not every group was found';
    const tried = new Set((guesses as string[][]).map(guessKey));
    if (!p.groups.every((g) => tried.has(guessKey(g.words)))) return 'not every group was guessed';
  }
  return { order: order.slice(), guesses: (guesses as string[][]).map((g) => g.slice()) };
}

function mini(p: MiniPuzzle, b: Obj, current: boolean): BoardResult<MiniBoard> {
  const { grid } = b;
  if (!strList(grid, MAX_SIZE, MAX_SIZE)) return 'bad grid';
  if (current && (grid.length !== p.grid.length || !isSolved(p.grid, grid))) return 'the grid is not solved';
  return { grid: grid.slice() };
}

function wordle(p: WordlePuzzle, b: Obj, current: boolean): BoardResult<WordleBoard> {
  const { guesses } = b;
  if (!strList(guesses, MAX_LEN, CAPS.wordleGuesses) || !guesses.every((g) => /^[A-Z]+$/.test(g))) return 'bad guesses';
  if (current && (guesses.length === 0 || guesses[guesses.length - 1] !== wordClean(p.answer))) return 'the last guess is not the answer';
  return { guesses: guesses.slice() };
}

function hashtag(p: HashtagPuzzle, b: Obj, current: boolean): BoardResult<HashtagBoard> {
  const { swaps } = b;
  const n = SQUARES.length - 1;
  if (!Array.isArray(swaps) || swaps.length > CAPS.hashtagSwaps || !swaps.every((s) => Array.isArray(s) && s.length === 2 && isInt(s[0], 0, n) && isInt(s[1], 0, n))) {
    return 'bad swaps';
  }
  const pairs = (swaps as [number, number][]).map(([a, c]): [number, number] => [a, c]);
  if (current) {
    let tiles = startTiles(p);
    for (const [a, c] of pairs) tiles = swap(tiles, a, c);
    if (tiles !== solution(p)) return 'the board is not solved';
  }
  return { swaps: pairs };
}

/**
 * Check a solve for `game` against the puzzle's data. `current` says whether the solve's rev is the
 * puzzle's current one (only then is the solution itself checked).
 */
export function checkSolve(game: GameId, data: unknown, payload: unknown, current: boolean): Checked {
  if (!isObj(payload) || !isObj(payload.board)) return { ok: false, error: 'bad payload' };
  const stats = checkStats(payload.stats);
  if (typeof stats === 'string') return { ok: false, error: stats };
  const b = payload.board;
  let board: BoardResult<SolvePayload['board']>;
  switch (game) {
    case 'wend':
      board = wend(data as WendPuzzle, b, current);
      break;
    case 'pinpoint':
      board = pinpoint(data as PinpointPuzzle, b, current);
      break;
    case 'crossclimb':
      board = crossclimb(data as CrossclimbPuzzle, b, current);
      break;
    case 'connections':
      board = connections(data as ConnectionsPuzzle, b, current);
      break;
    case 'mini':
      board = mini(data as MiniPuzzle, b, current);
      break;
    case 'wordle':
      board = wordle(data as WordlePuzzle, b, current);
      break;
    case 'hashtag':
      board = hashtag(data as HashtagPuzzle, b, current);
      break;
    default:
      return { ok: false, error: `${game} isn't playable yet` };
  }
  return typeof board === 'string' ? { ok: false, error: board } : { ok: true, payload: { board, stats } };
}
