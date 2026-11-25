/** Calendar math. Every day opens at local midnight in New York; the server clock decides. */

export const YEAR = 2026;
export const MONTH = 12;
export const DAY_COUNT = 31;
export const TZ = 'America/New_York';
const HOUR = 3600_000;

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

function parts(t: number, tz: string) {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(new Date(t))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return { y: out.year!, m: out.month!, d: out.day!, h: (out.hour ?? 0) % 24, min: out.minute!, s: out.second! };
}

/** Offset of `tz` from UTC at instant `t`, in ms (local minus UTC). */
export function tzOffsetMs(t: number, tz = TZ): number {
  const p = parts(t, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(t / 1000) * 1000;
}

/** UTC instant of local midnight y-m-d in `tz`. Overflowing days (Dec 32) roll over like Date.UTC. */
export function zonedMidnight(y: number, m: number, d: number, tz = TZ): number {
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - tzOffsetMs(guess, tz);
  return guess - tzOffsetMs(first, tz);
}

/** Local calendar date of instant `t` in `tz`. */
export function zonedDate(t: number, tz = TZ): { y: number; m: number; d: number } {
  const p = parts(t, tz);
  return { y: p.y, m: p.m, d: p.d };
}

/** Smallest local midnight at or after `t`. */
export function ceilToMidnight(t: number, tz = TZ): number {
  const { y, m, d } = zonedDate(t, tz);
  const mid = zonedMidnight(y, m, d, tz);
  return mid === t ? t : zonedMidnight(y, m, d + 1, tz);
}

export const opensAt = (n: number): number => zonedMidnight(YEAR, MONTH, n);
export const dayEnd = (n: number): number => zonedMidnight(YEAR, MONTH, n + 1);

export function isOpen(n: number, now: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= DAY_COUNT && opensAt(n) <= now;
}

/** Highest open day number, 0 before Dec 1. */
export function todayN(now: number): number {
  let n = 0;
  for (let i = 1; i <= DAY_COUNT; i++) if (opensAt(i) <= now) n = i;
  return n;
}

/** Deadline for a puzzle first published at `publishedAt` after its day had opened. */
export function lateDeadline(publishedAt: number): number {
  return ceilToMidnight(publishedAt + 24 * HOUR);
}

export function isLate(tsClient: string, deadline: string): boolean {
  return Date.parse(tsClient) > Date.parse(deadline);
}

export const iso = (t: number): string => new Date(t).toISOString();

/** "Dec 7" */
export const dayLabel = (n: number): string => `Dec ${n}`;

/** Day of week (0 = Sunday) for Dec n. */
export const weekday = (n: number): number => new Date(Date.UTC(YEAR, MONTH - 1, n)).getUTCDay();
