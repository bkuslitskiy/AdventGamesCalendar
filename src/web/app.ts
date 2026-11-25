import { getDay, getState } from './api.ts';
import { previewToken, storeFor, type Role, type Store } from './store.ts';
import type { DayResponse, SolveKey, SolveRecord, StateResponse } from '../core/types.ts';

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

async function loadState(): Promise<StateResponse> {
  try {
    const s = await getState(previewToken() ?? undefined);
    localStorage.setItem(STATE_CACHE, JSON.stringify(s));
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
