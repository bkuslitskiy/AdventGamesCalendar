/** Minimal structural types for Cloudflare Pages Functions + D1 (no @cloudflare/workers-types needed). */

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: { last_row_id?: number; changes?: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface Env {
  DB: D1Database;
  /** Bearer token for /api/admin/* and gate bypass on /api/day/:n. */
  ADMIN_TOKEN?: string;
  /** ntfy topic URL for solve pings. */
  NTFY_URL?: string;
  /** Play-testing only: freeze the server clock at this ISO time. */
  ADVENT_NOW?: string;
  /**
   * Pre-launch testing: "1" opens every day until Day 1 opens, "0" keeps the normal gate.
   * Unset: on for builds that include drafts (local dev, preview branches), off for production.
   */
  ADVENT_EARLY_ACCESS?: string;
}

export interface Ctx<P extends string = string> {
  request: Request;
  env: Env;
  params: Record<P, string | string[]>;
  waitUntil(promise: Promise<unknown>): void;
}

export type Handler<P extends string = string> = (ctx: Ctx<P>) => Response | Promise<Response>;
