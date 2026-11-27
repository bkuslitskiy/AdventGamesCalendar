import { h, mount } from './dom.ts';
import { makeApp, reloadIfUpdated, type App } from './app.ts';
import { babeKey, deviceId, getRole, identify, setBabeKey, setRole } from './store.ts';
import { ApiError, getProgress } from './api.ts';
import { renderBadLink, renderGate } from './views/gate.ts';
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

/** Leave the current address for `hash` without a history entry (and without a hashchange). */
const replaceHash = (hash: string) => history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);

/**
 * The babe link, `/#/babe/<key>`: check the key with the server, keep it, and play as babe. Once the
 * server has answered, the key leaves the address bar. If it couldn't be reached, the link stays, so
 * "Try again" still has it.
 */
async function claimBabe(key: string): Promise<void> {
  try {
    await getProgress(key);
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) throw e;
    replaceHash('#/');
    return renderBadLink(root, () => void route());
  }
  replaceHash('#/');
  setBabeKey(key);
  setRole('babe');
  deviceId();
  identify();
  app = null;
  await route();
}

async function route(): Promise<void> {
  app?.cleanup?.();
  if (app) app.cleanup = null;
  const hash = location.hash || '#/';
  try {
    const link = /^#\/babe\/([A-Za-z0-9_-]{16,200})$/.exec(hash);
    if (link) {
      await claimBabe(link[1]!);
      return;
    }
    if (hash.startsWith('#/admin')) {
      await renderAdmin(root);
      return;
    }
    const role = getRole();
    if (!role) {
      renderGate(root, !!babeKey(), (r) => {
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
    // The calendar checks for a newer deploy as it refreshes; day and game pages check here (the puzzle
    // being left has already saved its progress above).
    if (m && (await reloadIfUpdated())) return;
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
// Coming back to the tab after a while: re-read the clock and progress on the calendar, and pick up a
// newer deploy on a day page. A game in progress is left alone; the next page change picks it up.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !app) return;
  if (location.hash === '' || location.hash === '#/') void route();
  else if (/^#\/day\/\d+$/.test(location.hash)) void reloadIfUpdated(0);
});
void route();
