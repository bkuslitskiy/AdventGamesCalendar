import { h } from '../dom.ts';
import { loadDay, type App } from '../app.ts';
import { shell } from './shell.ts';
import { gameStatus } from '../../core/calendar.ts';
import { ALL_GAMES, GAME_NAMES, type GameId } from '../../core/types.ts';

export const BLURB: Partial<Record<GameId, string>> = {
  wend: 'Trace the hidden words. Every letter is used once.',
  pinpoint: 'Find what links five clues, in as few as you can.',
  crossclimb: 'Solve the clues, then climb the ladder one letter at a time.',
  connections: 'Sort sixteen words into four groups of four.',
  mini: 'A five-minute crossword.',
  wordle: 'Guess the word from coloured hints.',
};

const STATE_TEXT = { unsolved: 'To play', late: 'Solved late', ontime: 'Solved' };

export function longDate(n: number): string {
  return new Date(Date.UTC(2026, 11, n)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

export async function renderDay(app: App, n: number): Promise<void> {
  const info = app.state.days[n - 1];
  const back = h('a', { class: 'back', href: '#/' }, '‹ Calendar');
  if (!info?.open) {
    shell(app, () => renderDay(app, n), back, h('div', { class: 'dayhead' }, h('h1', null, `Day ${n}`), h('p', null, `Opens at midnight on ${longDate(n)}.`)));
    return;
  }
  const day = await loadDay(app, n);
  const games = ALL_GAMES.filter((g) => day.puzzles[g]);
  const missing = app.state.expected.filter((g) => !day.puzzles[g]);
  const allDone = games.length > 0 && games.every((g) => gameStatus(n, g, app.solves) !== 'unsolved');

  shell(
    app,
    () => renderDay(app, n),
    back,
    h('div', { class: 'dayhead' }, h('h1', null, `Day ${n}`), h('p', null, longDate(n))),
    h(
      'ul',
      { class: 'games' },
      games.map((g) => {
        const st = gameStatus(n, g, app.solves);
        return h(
          'li',
          null,
          h(
            'a',
            { href: `#/day/${n}/${g}` },
            h('span', { class: 'name' }, GAME_NAMES[g]),
            h('span', { class: 'what' }, BLURB[g] ?? ''),
            h('span', { class: ['state', st] }, STATE_TEXT[st]),
          ),
        );
      }),
      missing.map((g) =>
        h('li', null, h('div', { class: 'soon' }, h('span', { class: 'name' }, GAME_NAMES[g]), h('span', { class: 'what' }, 'Coming soon. Check back later today.'))),
      ),
    ),
    allDone && day.afterword ? h('div', { class: 'afterword' }, day.afterword) : null,
  );
}
