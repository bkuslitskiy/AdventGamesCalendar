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

export function isAdmin(request: Request, env: Env): boolean {
  const token = env.ADMIN_TOKEN;
  if (!token) return false;
  const header = request.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return !!m && safeEqual(m[1]!.trim(), token);
}

export function requireAdmin(request: Request, env: Env): Response | null {
  if (!env.ADMIN_TOKEN) return fail(503, 'admin disabled: set the ADMIN_TOKEN secret');
  return isAdmin(request, env) ? null : fail(401, 'bad admin token');
}

export async function readJson<T>(request: Request, maxBytes = 32_000): Promise<T | null> {
  const text = await request.text();
  if (text.length > maxBytes) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
