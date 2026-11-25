import { h, mount } from './dom.ts';
import { makeApp, type App } from './app.ts';
import { deviceId, getRole, identify, setRole } from './store.ts';
import { renderGate } from './views/gate.ts';
import { renderCalendar } from './views/calendar.ts';
import { renderDay } from './views/day.ts';
import { renderPlay } from './views/play.ts';
import { renderAdmin } from './views/admin.ts';
import { isGameId } from '../core/types.ts';

const root = document.getElementById('app')!;
let app: App | null = null;

function showError(e: unknown): void {
  console.error(e);
  mount(
    root,
    h(
      'section',
      { class: 'gate' },
      h('h1', null, 'Advent'),
      h('p', { class: 'err' }, 'Couldn’t reach the server. Check your connection, then try again.'),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => route() }, 'Try again')),
    ),
  );
}

async function route(): Promise<void> {
  app?.cleanup?.();
  if (app) app.cleanup = null;
  const hash = location.hash || '#/';
  try {
    if (hash.startsWith('#/admin')) {
      await renderAdmin(root);
      return;
    }
    const role = getRole();
    if (!role) {
      renderGate(root, (r) => {
        setRole(r);
        if (r === 'babe') {
          deviceId();
          identify();
        }
        app = null;
        location.hash = '#/';
        route();
      });
      return;
    }
    if (!app || app.role !== role) app = await makeApp(root, role);
    const m = /^#\/day\/(\d+)(?:\/([a-z]+))?/.exec(hash);
    if (m) {
      const n = Number(m[1]);
      if (m[2] && isGameId(m[2])) await renderPlay(app, n, m[2]);
      else await renderDay(app, n);
    } else {
      await renderCalendar(app);
    }
  } catch (e) {
    showError(e);
  }
}

window.addEventListener('hashchange', () => void route());
// Coming back to the tab after a while: re-read the clock and progress on the calendar.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && app && (location.hash === '' || location.hash === '#/')) void route();
});
void route();
