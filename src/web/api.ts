import type { DayResponse, EventInput, ProgressResponse, StateResponse } from '../core/types.ts';
import type { AdminEventView } from './admin-types.ts';

/** Difference between the server clock and this device's clock. The server decides what is open. */
let offset = 0;
export const clockNow = (): number => Date.now() + offset;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  const res = await fetch(path, { ...init, headers, cache: 'no-store' });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText);
  return data;
}

export async function getState(previewToken?: string): Promise<StateResponse> {
  const s = await call<StateResponse>(previewToken ? '/api/state?preview=1' : '/api/state', {}, previewToken);
  offset = Date.parse(s.now) - Date.now();
  return s;
}

export const getDay = (n: number, token?: string) => call<DayResponse>(`/api/day/${n}`, {}, token);
/** Babe's progress. `key` is the babe key on her devices, or the admin token on the admin page. */
export const getProgress = (key: string) => call<ProgressResponse>('/api/progress', {}, key);
export const postEvent = (e: EventInput, key: string) =>
  call<{ ok: true; id: number; late?: boolean }>('/api/events', { method: 'POST', body: JSON.stringify(e) }, key);

export type RemoteVerdict = 'correct' | 'wrong' | 'unavailable';

/** Ask the server's AI judge about a Pinpoint guess the word matcher rejected. Never throws. */
export async function judgeGuess(day: number, guess: string, token?: string): Promise<RemoteVerdict> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'unavailable';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10_000);
  try {
    const r = await call<{ verdict?: RemoteVerdict }>('/api/judge', { method: 'POST', body: JSON.stringify({ day, guess }), signal: ctl.signal }, token);
    return r.verdict === 'correct' || r.verdict === 'wrong' ? r.verdict : 'unavailable';
  } catch {
    return 'unavailable';
  } finally {
    clearTimeout(timer);
  }
}

export const adminLog = (token: string, q = '') => call<{ events: AdminEventView[] }>(`/api/admin/log${q}`, {}, token);
export const adminVoid = (token: string, body: { ids: number[]; reason: string }) =>
  call<{ ok: true; id: number; voided: number[] }>('/api/admin/void', { method: 'POST', body: JSON.stringify(body) }, token);
export const adminReset = (token: string, body: { day: number; game: string | null; reason: string }) =>
  call<{ ok: true; id: number }>('/api/admin/reset', { method: 'POST', body: JSON.stringify(body) }, token);
