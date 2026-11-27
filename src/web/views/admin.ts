import { h, mount, fmtTime } from '../dom.ts';
import { adminLog, adminReset, adminVoid, getProgress, ApiError } from '../api.ts';
import { lsDel, lsGet, lsSet } from '../store.ts';
import { DAY_COUNT } from '../../core/time.ts';
import { EXPECTED_GAMES, GAME_NAMES, pinpointShown, type GameId, type PinpointBoard } from '../../core/types.ts';
import type { AdminEventView } from '../admin-types.ts';

const TOKEN = 'advent.adminToken';

const et = (isoTime: string | null) =>
  isoTime
    ? new Date(isoTime).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';

// Payloads are read defensively: the log is append-only and may hold events from before the server
// checked solves, and one odd event must never stop the page from rendering (it's how bad ones get voided).

const SHOWN = { asked: 'asked for the answer', cutoff: 'cut off' } as const;
/** Pinpoint games that ended by showing the answer, or were solved by the AI judge's say-so. */
const shownNote = (board: unknown): string | null => {
  const how = pinpointShown(board);
  if (how === 'asked' || how === 'cutoff') return SHOWN[how];
  const b = board as Partial<PinpointBoard> | null;
  if (!b?.aiAccepted) return null;
  const last = Array.isArray(b.guesses) ? b.guesses[b.guesses.length - 1] : undefined;
  return `AI accepted “${typeof last === 'string' ? last : ''}”`;
};

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const statsOf = (payload: unknown): { ms: number; attempts: number } => {
  const st = (payload as { stats?: { ms?: unknown; attempts?: unknown } } | null)?.stats;
  return { ms: num(st?.ms), attempts: num(st?.attempts) };
};
const boardOf = (payload: unknown): unknown => (payload as { board?: unknown } | null)?.board;

/** Run `fn`; if a malformed payload makes it throw, show `fallback` instead. */
function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (e) {
    console.warn('admin: unreadable event', e);
    return fallback;
  }
}

function detail(e: AdminEventView): string {
  const p = e.payload as Record<string, unknown> | null;
  if (e.type === 'solve' && p && typeof p === 'object') {
    const st = statsOf(p);
    const note = shownNote(p.board);
    return `${fmtTime(st.ms)}, ${st.attempts} misses${note ? `, ${note}` : ''}, rev ${e.rev}`;
  }
  const ids = Array.isArray(p?.ids) ? p.ids.join(', ') : '';
  const reason = typeof p?.reason === 'string' && p.reason ? `: ${p.reason}` : '';
  if (e.type === 'void') return `voids ${ids}${reason}`;
  if (e.type === 'reset') return `${e.game ?? 'all games'}${reason}`;
  return e.ua ?? '';
}

/** Which events in this page of the log are currently hidden by voids (same rule as replay). */
function voidedIn(events: AdminEventView[]): Set<number> {
  const voided = new Set<number>();
  for (const e of [...events].sort((a, b) => b.id - a.id)) {
    if (e.type !== 'void' || voided.has(e.id)) continue;
    const ids = (e.payload as { ids?: unknown } | null)?.ids;
    for (const id of Array.isArray(ids) ? ids : []) if (typeof id === 'number') voided.add(id);
  }
  return voided;
}

export async function renderAdmin(root: HTMLElement): Promise<void> {
  const token = lsGet(TOKEN);
  if (!token) {
    const input = h('input', { type: 'password', placeholder: 'Admin token', autocomplete: 'current-password', 'aria-label': 'Admin token' });
    mount(
      root,
      h(
        'section',
        { class: 'admin' },
        h('header', { class: 'top' }, h('a', { class: 'wordmark', href: '#/' }, 'Advent'), h('div', { class: 'who' }, 'Admin')),
        h(
          'form',
          {
            class: 'controls',
            onsubmit: (ev: Event) => {
              ev.preventDefault();
              if (!input.value.trim()) return;
              lsSet(TOKEN, input.value.trim());
              renderAdmin(root);
            },
          },
          input,
          h('button', { class: 'btn small', type: 'submit' }, 'Unlock'),
        ),
      ),
    );
    return;
  }

  const status = h('p', { role: 'status' });
  const progressBox = h('div', { class: 'scroll' });
  const logBox = h('div', { class: 'scroll' });
  const say = (msg: string, bad = false) => {
    status.textContent = msg;
    status.className = bad ? 'err' : '';
  };
  const onError = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) {
      lsDel(TOKEN);
      say('That token was rejected. Enter it again.', true);
      setTimeout(() => renderAdmin(root), 1200);
      return;
    }
    say(e instanceof Error ? e.message : String(e), true);
  };

  async function loadProgress() {
    const { solves } = await getProgress(token!);
    mount(
      progressBox,
      solves.length
        ? h(
            'table',
            null,
            h('thead', null, h('tr', null, ['Day', 'Game', 'Solved (ET)', 'On time', 'Time', 'Misses'].map((t) => h('th', null, t)))),
            h(
              'tbody',
              null,
              solves.map((s) =>
                safe(
                  () => {
                    const st = statsOf(s.payload);
                    const note = shownNote(boardOf(s.payload));
                    return h(
                      'tr',
                      null,
                      h('td', null, s.day),
                      h('td', null, GAME_NAMES[s.game] ?? String(s.game)),
                      h('td', null, et(s.tsClient)),
                      h('td', null, s.late ? 'late' : 'yes'),
                      h('td', null, fmtTime(st.ms)),
                      h('td', null, st.attempts, note ? ` (${note})` : null),
                    );
                  },
                  h('tr', null, h('td', null, s.day), h('td', null, String(s.game)), h('td', { colspan: 4 }, 'unreadable solve')),
                ),
              ),
            ),
          )
        : h('p', null, 'No solves yet.'),
    );
  }

  const dayFilter = h('select', { 'aria-label': 'Filter by day' }, h('option', { value: '' }, 'All days'), Array.from({ length: DAY_COUNT }, (_, i) => h('option', { value: String(i + 1) }, `Day ${i + 1}`)));
  const typeFilter = h('select', { 'aria-label': 'Filter by type' }, ['', 'solve', 'identify', 'reset', 'void'].map((t) => h('option', { value: t }, t || 'All types')));
  const selected = new Set<number>();

  async function loadLog() {
    const q = new URLSearchParams();
    if (dayFilter.value) q.set('day', dayFilter.value);
    if (typeFilter.value) q.set('type', typeFilter.value);
    q.set('limit', '300');
    const { events } = await adminLog(token!, `?${q}`);
    const voided = voidedIn(events);
    selected.clear();
    mount(
      logBox,
      h(
        'table',
        null,
        h('thead', null, h('tr', null, ['', 'Id', 'Type', 'Day', 'Game', 'When (ET)', 'Device', 'Detail'].map((t) => h('th', null, t)))),
        h(
          'tbody',
          null,
          events.map((e) =>
            h(
              'tr',
              { class: voided.has(e.id) && 'voided' },
              h(
                'td',
                null,
                h('input', {
                  type: 'checkbox',
                  'aria-label': `Select event ${e.id}`,
                  onchange: (ev: Event) => ((ev.target as HTMLInputElement).checked ? selected.add(e.id) : selected.delete(e.id)),
                }),
              ),
              h('td', null, e.id),
              h('td', null, e.type),
              h('td', null, e.day ?? ''),
              h('td', null, e.game ?? ''),
              h('td', null, et(e.tsServer)),
              h('td', { title: e.device }, String(e.device ?? '').slice(0, 8)),
              h('td', null, safe(() => detail(e), 'unreadable payload')),
            ),
          ),
        ),
      ),
    );
  }

  const resetDay = h('select', { 'aria-label': 'Day to reset' }, Array.from({ length: DAY_COUNT }, (_, i) => h('option', { value: String(i + 1) }, `Day ${i + 1}`)));
  const resetGame = h('select', { 'aria-label': 'Game to reset' }, h('option', { value: '' }, 'All games'), EXPECTED_GAMES.map((g) => h('option', { value: g }, GAME_NAMES[g])));

  // Each half loads on its own, so a failure in one still shows the other (and the log, to void from).
  const reloadAll = () => Promise.all([loadProgress().catch(onError), loadLog().catch(onError)]);

  mount(
    root,
    h(
      'section',
      { class: 'admin' },
      h('header', { class: 'top' }, h('a', { class: 'wordmark', href: '#/' }, 'Advent'), h('div', { class: 'who' }, 'Admin')),
      h(
        'div',
        { class: 'controls' },
        h(
          'button',
          {
            class: 'btn small',
            onclick: () => {
              sessionStorage.setItem('advent.preview', token);
              location.hash = '#/';
              location.reload();
            },
          },
          'Preview every day',
        ),
        h(
          'button',
          {
            class: 'btn ghost small',
            onclick: () => {
              lsDel(TOKEN);
              renderAdmin(root);
            },
          },
          'Forget token',
        ),
      ),
      status,
      h('h2', null, 'Babe’s progress'),
      progressBox,
      h('h2', null, 'Reset a day'),
      h('p', null, 'Appends a reset event. Void it in the log to undo.'),
      h(
        'div',
        { class: 'controls' },
        resetDay,
        resetGame,
        h(
          'button',
          {
            class: 'btn small',
            onclick: async () => {
              const day = Number(resetDay.value);
              const game = (resetGame.value || null) as GameId | null;
              if (!confirm(`Reset day ${day}${game ? ` ${GAME_NAMES[game]}` : ''} for babe?`)) return;
              try {
                const r = await adminReset(token, { day, game, reason: 'admin reset' });
                say(`Reset logged as event ${r.id}.`);
                await reloadAll();
              } catch (e) {
                onError(e);
              }
            },
          },
          'Reset',
        ),
      ),
      h('h2', null, 'Event log'),
      h(
        'div',
        { class: 'controls' },
        dayFilter,
        typeFilter,
        h('button', { class: 'btn ghost small', onclick: () => loadLog().catch(onError) }, 'Filter'),
        h(
          'button',
          {
            class: 'btn small',
            onclick: async () => {
              if (!selected.size) return say('Select events to void first.', true);
              const reason = prompt(`Void ${selected.size} event(s)? Reason:`, '');
              if (reason === null) return;
              try {
                const r = await adminVoid(token, { ids: [...selected], reason });
                say(`Voided ${r.voided.join(', ')} with event ${r.id}.`);
                await reloadAll();
              } catch (e) {
                onError(e);
              }
            },
          },
          'Void selected',
        ),
      ),
      logBox,
    ),
  );
  await reloadAll();
}
