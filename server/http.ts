import type { Env } from './types.ts';

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}

export function fail(status: number, error: string, detail?: unknown): Response {
  return json(detail === undefined ? { error } : { error, detail }, status);
}

/** Server clock in ms. ADVENT_NOW freezes it for play-testing on preview deployments. */
export function nowMs(env: Env): number {
  if (env.ADVENT_NOW) {
    const t = Date.parse(env.ADVENT_NOW);
    if (!Number.isNaN(t)) return t;
  }
  return Date.now();
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bearer(request: Request): string {
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '');
  return m ? m[1]!.trim() : '';
}

export function isAdmin(request: Request, env: Env): boolean {
  return !!env.ADMIN_TOKEN && safeEqual(bearer(request), env.ADMIN_TOKEN);
}

export function requireAdmin(request: Request, env: Env): Response | null {
  if (!env.ADMIN_TOKEN) return fail(503, 'admin disabled: set the ADMIN_TOKEN secret');
  return isAdmin(request, env) ? null : fail(401, 'bad admin token');
}

/** Babe's devices send BABE_KEY, which reaches them once through the link `/#/babe/<key>`. */
export function isBabe(request: Request, env: Env): boolean {
  return !!env.BABE_KEY && safeEqual(bearer(request), env.BABE_KEY);
}

/** Null when the request carries the babe key (or, with `orAdmin`, the admin token); otherwise the error to send. */
export function requireBabe(request: Request, env: Env, { orAdmin = false } = {}): Response | null {
  if (isBabe(request, env) || (orAdmin && isAdmin(request, env))) return null;
  if (!env.BABE_KEY) return fail(503, 'babe mode disabled: set the BABE_KEY secret');
  return fail(401, 'bad babe key');
}

/** True when the declared body is bigger than `maxBytes`, so it can be refused before it's read. */
export function tooLarge(request: Request, maxBytes: number): boolean {
  return Number(request.headers.get('content-length') ?? 0) > maxBytes;
}

export async function readJson<T>(request: Request, maxBytes = 32_000): Promise<T | null> {
  if (tooLarge(request, maxBytes)) return null;
  const text = await request.text();
  if (text.length > maxBytes) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
