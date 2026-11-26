import { getDay, getState } from './api.ts';
import { previewToken, storeFor, type Role, type Store } from './store.ts';
import type { DayResponse, SolveKey, SolveRecord, StateResponse } from '../core/types.ts';
import { BUILD } from './build.ts';

export interface App {
  root: HTMLElement;
  role: Role;
  store: Store;
  state: StateResponse;
  solves: Map<SolveKey, SolveRecord>;
  days: Map<number, DayResponse>;
  /** Called before the next view renders (stops timers). */
  cleanup: (() => void) | null;
}

const STATE_CACHE = 'advent.state';
const RELOADED_FOR = 'advent.reloadedFor';
let lastCheck = 0;

/**
 * The server runs a newer deploy than this page's code: reload to pick it up (code and puzzle content).
 * At most once per new build per tab, so a cached bundle can't loop. Callers save in-progress state first.
 */
function reloadIfStale(s: StateResponse): boolean {
  lastCheck = Date.now();
  if (!s.build || BUILD === 'dev' || s.build === BUILD) return false;
  try {
    if (sessionStorage.getItem(RELOADED_FOR) === s.build) return false;
    sessionStorage.setItem(RELOADED_FOR, s.build);
  } catch {
    return false;
  }
  location.reload();
  return true;
}

/** Ask the server which deploy is live (at most every `minGapMs`) and reload if it's newer. Never throws. */
export async function reloadIfUpdated(minGapMs = 15_000): Promise<boolean> {
  if (Date.now() - lastCheck < minGapMs) return false;
  try {
    return reloadIfStale(await getState(previewToken() ?? undefined));
  } catch {
    return false;
  }
}

async function loadState(): Promise<StateResponse> {
  try {
    const s = await getState(previewToken() ?? undefined);
    localStorage.setItem(STATE_CACHE, JSON.stringify(s));
    reloadIfStale(s);
    return s;
  } catch (e) {
    const cached = localStorage.getItem(STATE_CACHE);
    if (cached && !previewToken()) return JSON.parse(cached) as StateResponse;
    throw e;
  }
}

export async function makeApp(root: HTMLElement, role: Role): Promise<App> {
  const store = storeFor(role);
  const [state, solves] = await Promise.all([loadState(), store.load()]);
  return { root, role, store, state, solves, days: new Map(), cleanup: null };
}

/** Re-read the clock, open days and progress (e.g. returning to the calendar after midnight). */
export async function refresh(app: App): Promise<void> {
  const [state, solves] = await Promise.all([loadState(), app.store.load()]);
  if (state.today !== app.state.today) app.days.clear();
  app.state = state;
  app.solves = solves;
}

export async function loadDay(app: App, n: number): Promise<DayResponse> {
  let d = app.days.get(n);
  if (!d) {
    d = await getDay(n, previewToken() ?? undefined);
    app.days.set(n, d);
  }
  return d;
}
