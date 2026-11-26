import { h } from '../dom.ts';
import { clockNow } from '../api.ts';
import { refresh, type App } from '../app.ts';
import { shell } from './shell.ts';
import { dayStatus, gameStatus } from '../../core/calendar.ts';
import { DAY_COUNT, opensAt, weekday } from '../../core/time.ts';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function until(ms: number): string {
  const mins = Math.max(1, Math.ceil(ms / 60_000));
  const d = Math.floor(mins / 1440);
  const hrs = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const parts = [d && `${d} day${d === 1 ? '' : 's'}`, hrs && `${hrs} hour${hrs === 1 ? '' : 's'}`, !d && m && `${m} minute${m === 1 ? '' : 's'}`];
  return parts.filter(Boolean).slice(0, 2).join(' and ');
}

export async function renderCalendar(app: App): Promise<void> {
  await refresh(app);
  const { state, solves } = app;
  const today = state.today;

  const behind = state.days.filter((d) => d.open && dayStatus(d.n, d.open, d.games, solves) === 'unsolved').length;
  const left = behind ? `${behind} ${behind === 1 ? 'day has' : 'days have'} puzzles left.` : 'Nothing left to solve.';
  let lede: Node;
  if (today === 0 && state.early) {
    lede = h(
      'div',
      { class: 'lede' },
      h('p', null, `Early access: every day is open for testing until Day 1 opens in ${until(opensAt(1) - clockNow())}.`),
      h('p', { class: 'sub' }, left),
    );
  } else if (today === 0) {
    lede = h('p', { class: 'lede' }, `Day 1 opens in ${until(opensAt(1) - clockNow())}.`);
  } else {
    lede = h(
      'p',
      { class: 'lede' },
      today < DAY_COUNT ? h('a', { href: `#/day/${today}` }, `Day ${today} is open.`) : h('a', { href: `#/day/${today}` }, 'Every day is open.'),
      ' ',
      left,
    );
  }

  const cells: Node[] = DOW.map((d) => h('div', { class: 'dow', 'aria-hidden': 'true' }, d));
  for (let i = 0; i < weekday(1); i++) cells.push(h('div', { 'aria-hidden': 'true' }));
  for (const d of state.days) {
    const status = dayStatus(d.n, d.open, d.games, solves);
    if (!d.open) {
      cells.push(h('div', { class: 'door locked', 'aria-label': `December ${d.n}, not open yet` }, h('span', { class: 'n' }, d.n)));
      continue;
    }
    const pips = d.games.map((g) => h('span', { class: ['pip', gameStatus(d.n, g, solves)] }));
    const words = { empty: 'puzzles coming soon', unsolved: 'puzzles left', late: 'solved, some late', ontime: 'all solved on the day', locked: '' }[status];
    cells.push(
      h(
        'a',
        { class: ['door', status, d.n === today && 'today'], href: `#/day/${d.n}`, 'aria-label': `December ${d.n}, ${words}` },
        h('span', { class: 'n' }, d.n),
        h('span', { class: 'pips' }, pips),
      ),
    );
  }

  shell(
    app,
    () => renderCalendar(app),
    lede,
    h('div', { class: 'month' }, cells),
    h(
      'div',
      { class: 'legend' },
      h('span', null, h('i', { class: 'swatch ontime' }), 'Solved on the day'),
      h('span', null, h('i', { class: 'swatch late' }), 'Solved late'),
      h('span', null, h('i', { class: 'swatch' }), 'Puzzles left'),
      h('span', null, h('i', { class: 'swatch locked' }), 'Not open yet'),
    ),
  );
}
