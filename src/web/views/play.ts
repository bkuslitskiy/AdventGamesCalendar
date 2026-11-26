import { h, fmtTime, plural } from '../dom.ts';
import { clockNow } from '../api.ts';
import { loadDay, type App } from '../app.ts';
import { shell } from './shell.ts';
import { longDate } from './day.ts';
import { Stopwatch } from '../timer.ts';
import { clearWip, loadWip, saveWip } from '../store.ts';
import { iso, isLate } from '../../core/time.ts';
import {
  ALL_GAMES,
  GAME_NAMES,
  solveKey,
  type ConnectionsPuzzle,
  type CrossclimbPuzzle,
  type GameId,
  type MiniPuzzle,
  type PinpointBoard,
  type PinpointPuzzle,
  type PublishedPuzzle,
  type SolveRecord,
  type WendPuzzle,
  type WordleBoard,
  type WordlePuzzle,
} from '../../core/types.ts';
import { wendGame, WEND_HOWTO } from '../games/wend.ts';
import { pinpointGame, PINPOINT_HOWTO } from '../games/pinpoint.ts';
import { crossclimbGame, CROSSCLIMB_HOWTO } from '../games/crossclimb.ts';
import { connectionsGame, CONNECTIONS_HOWTO } from '../games/connections.ts';
import { miniGame, MINI_HOWTO } from '../games/mini.ts';
import { wordleGame, WORDLE_HOWTO } from '../games/wordle.ts';
import type { GameView } from '../games/types.ts';

interface Wrapper<W> {
  ms: number;
  game: W | null;
}

const HOWTO: Partial<Record<GameId, string>> = {
  wend: WEND_HOWTO,
  pinpoint: PINPOINT_HOWTO,
  crossclimb: CROSSCLIMB_HOWTO,
  connections: CONNECTIONS_HOWTO,
  mini: MINI_HOWTO,
  wordle: WORDLE_HOWTO,
};

function detailFor(rec: SolveRecord): string {
  const { stats, board } = rec.payload;
  const t = fmtTime(stats.ms);
  switch (rec.game) {
    case 'pinpoint':
      return `Got it on clue ${(board as PinpointBoard).cluesSeen} of 5 in ${t}.`;
    case 'wordle':
      return `Got it in ${plural((board as WordleBoard).guesses.length, 'guess', 'guesses')}, ${t}.`;
    case 'connections':
      return `${t}, ${plural(stats.attempts, 'mistake')}.`;
    case 'mini':
      return stats.attempts
        ? `${t}. The full grid needed fixing ${stats.attempts === 1 ? 'once' : `${stats.attempts} times`}.`
        : `Clean solve in ${t}.`;
    default:
      return `${t}, ${plural(stats.attempts, 'miss', 'misses')}.`;
  }
}

function resultCard(app: App, n: number, rec: SolveRecord): HTMLElement {
  const nextGame = ALL_GAMES.find((g) => g !== rec.game && app.days.get(n)?.puzzles[g] && !app.solves.has(solveKey(n, g)));
  const detail = detailFor(rec);
  return h(
    'div',
    { class: ['result', rec.late && 'late'] },
    h('h2', null, rec.late ? 'Solved late' : 'Solved on the day'),
    h('p', null, detail),
    h(
      'div',
      { class: 'actions' },
      nextGame ? h('a', { class: 'btn', href: `#/day/${n}/${nextGame}` }, `Play ${GAME_NAMES[nextGame]}`) : null,
      h('a', { class: ['btn', nextGame && 'ghost'], href: nextGame ? `#/day/${n}` : '#/' }, nextGame ? `Day ${n}` : 'Back to the calendar'),
    ),
  );
}

export async function renderPlay(app: App, n: number, game: GameId): Promise<void> {
  app.cleanup?.();
  app.cleanup = null;
  const rerender = () => renderPlay(app, n, game);
  const back = h('a', { class: 'back', href: `#/day/${n}` }, `‹ Day ${n}`);
  const info = app.state.days[n - 1];
  const day = info?.open ? await loadDay(app, n) : null;
  const pub = day?.puzzles[game] as PublishedPuzzle | undefined;
  if (!pub) {
    shell(app, rerender, back, h('p', { class: 'lede' }, 'That puzzle isn’t out yet.'));
    return;
  }

  const k = solveKey(n, game);
  const done = app.solves.get(k) ?? null;
  const role = app.role;
  const wrap = done ? null : loadWip<Wrapper<unknown>>(role, n, game, pub.rev);
  const clock = h('span', { class: 'clock', 'aria-label': 'Time on this puzzle' }, fmtTime(done ? done.payload.stats.ms : wrap?.ms ?? 0));
  let latest: unknown = wrap?.game ?? null;
  const watch = new Stopwatch(wrap?.ms ?? 0, (ms) => {
    clock.textContent = fmtTime(ms);
    if (ms % 5000 < 1000) saveWip(role, n, game, pub.rev, { ms, game: latest });
  });

  const common = {
    rev: pub.rev,
    save: (w: unknown) => {
      latest = w;
      saveWip(role, n, game, pub.rev, { ms: watch.value(), game: w });
    },
    onSolve: async (board: unknown, attempts: number) => {
      watch.stop();
      const tsClient = iso(clockNow());
      const rec: SolveRecord = {
        day: n,
        game,
        rev: pub.rev,
        tsClient,
        late: isLate(tsClient, pub.deadline),
        payload: { board: board as SolveRecord['payload']['board'], stats: { ms: watch.value(), attempts } },
      };
      app.cleanup = null;
      clearWip(role, n, game, pub.rev);
      await app.store.record(rec);
      app.solves.set(k, rec);
      rerender();
    },
  };

  let view: GameView;
  if (game === 'wend') {
    view = wendGame({ ...common, puzzle: pub.data as WendPuzzle, wip: (wrap?.game as never) ?? null, solved: (done?.payload.board as never) ?? null });
  } else if (game === 'pinpoint') {
    view = pinpointGame({ ...common, puzzle: pub.data as PinpointPuzzle, wip: (wrap?.game as never) ?? null, solved: (done?.payload.board as never) ?? null });
  } else if (game === 'crossclimb') {
    view = crossclimbGame({ ...common, puzzle: pub.data as CrossclimbPuzzle, wip: (wrap?.game as never) ?? null, solved: (done?.payload.board as never) ?? null });
  } else if (game === 'connections') {
    view = connectionsGame({ ...common, puzzle: pub.data as ConnectionsPuzzle, wip: (wrap?.game as never) ?? null, solved: (done?.payload.board as never) ?? null });
  } else if (game === 'mini') {
    view = miniGame({ ...common, puzzle: pub.data as MiniPuzzle, wip: (wrap?.game as never) ?? null, solved: (done?.payload.board as never) ?? null });
  } else if (game === 'wordle') {
    view = wordleGame({ ...common, puzzle: pub.data as WordlePuzzle, wip: (wrap?.game as never) ?? null, solved: (done?.payload.board as never) ?? null });
  } else {
    shell(app, rerender, back, h('p', { class: 'lede' }, `${GAME_NAMES[game]} isn’t playable yet.`));
    return;
  }

  if (!done) {
    watch.start();
    app.cleanup = () => {
      watch.stop();
      saveWip(role, n, game, pub.rev, { ms: watch.value(), game: latest });
      view.destroy?.();
    };
  }

  shell(
    app,
    rerender,
    back,
    h('div', { class: 'playhead' }, h('h1', null, GAME_NAMES[game]), clock),
    h('p', { class: 'howto' }, done ? `Day ${n}, ${longDate(n)}` : HOWTO[game]),
    done ? resultCard(app, n, done) : null,
    view.el,
  );
}
