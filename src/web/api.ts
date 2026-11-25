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
export const getProgress = () => call<ProgressResponse>('/api/progress');
export const postEvent = (e: EventInput) =>
  call<{ ok: true; id: number; late?: boolean }>('/api/events', { method: 'POST', body: JSON.stringify(e) });

export const adminLog = (token: string, q = '') => call<{ events: AdminEventView[] }>(`/api/admin/log${q}`, {}, token);
export const adminVoid = (token: string, body: { ids: number[]; reason: string }) =>
  call<{ ok: true; id: number; voided: number[] }>('/api/admin/void', { method: 'POST', body: JSON.stringify(body) }, token);
export const adminReset = (token: string, body: { day: number; game: string | null; reason: string }) =>
  call<{ ok: true; id: number }>('/api/admin/reset', { method: 'POST', body: JSON.stringify(body) }, token);
