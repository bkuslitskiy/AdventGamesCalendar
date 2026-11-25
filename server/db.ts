import type { D1Database } from './types.ts';
import type { GameId, LogEvent } from '../src/core/types.ts';

interface Row {
  id: number;
  client_id: string | null;
  ts_server: string;
  ts_client: string | null;
  device: string;
  ua: string | null;
  type: LogEvent['type'];
  day: number | null;
  game: GameId | null;
  rev: string | null;
  payload: string | null;
}

export interface AdminEvent extends LogEvent {
  clientId: string | null;
  ua: string | null;
}

function toEvent(r: Row): AdminEvent {
  let payload: unknown = null;
  if (r.payload) {
    try {
      payload = JSON.parse(r.payload);
    } catch {
      payload = r.payload;
    }
  }
  return {
    id: r.id,
    type: r.type,
    day: r.day,
    game: r.game,
    rev: r.rev,
    tsClient: r.ts_client,
    tsServer: r.ts_server,
    device: r.device,
    payload,
    clientId: r.client_id,
    ua: r.ua,
  };
}

export interface NewEvent {
  clientId?: string | null;
  tsServer: string;
  tsClient?: string | null;
  device: string;
  ua?: string | null;
  type: LogEvent['type'];
  day?: number | null;
  game?: GameId | null;
  rev?: string | null;
  payload?: unknown;
}

/** Append one event. Returns its id; a repeated clientId returns the original id. */
export async function appendEvent(db: D1Database, e: NewEvent): Promise<{ id: number; duplicate: boolean }> {
  const res = await db
    .prepare(
      `INSERT OR IGNORE INTO events (client_id, ts_server, ts_client, device, ua, type, day, game, rev, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      e.clientId ?? null,
      e.tsServer,
      e.tsClient ?? null,
      e.device,
      e.ua ?? null,
      e.type,
      e.day ?? null,
      e.game ?? null,
      e.rev ?? null,
      e.payload === undefined ? null : JSON.stringify(e.payload),
    )
    .run();
  if (res.meta.changes) return { id: Number(res.meta.last_row_id), duplicate: false };
  const existing = await db.prepare('SELECT id FROM events WHERE client_id = ?').bind(e.clientId ?? null).first<{ id: number }>();
  return { id: existing?.id ?? 0, duplicate: true };
}

export async function allEvents(db: D1Database): Promise<AdminEvent[]> {
  const { results } = await db.prepare('SELECT * FROM events ORDER BY id').all<Row>();
  return results.map(toEvent);
}

export async function queryEvents(
  db: D1Database,
  f: { day?: number; type?: string; device?: string; limit: number },
): Promise<AdminEvent[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.day) {
    where.push('day = ?');
    args.push(f.day);
  }
  if (f.type) {
    where.push('type = ?');
    args.push(f.type);
  }
  if (f.device) {
    where.push('device = ?');
    args.push(f.device);
  }
  const sql = `SELECT * FROM events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`;
  const { results } = await db.prepare(sql).bind(...args, f.limit).all<Row>();
  return results.map(toEvent);
}

export async function idsForDevice(db: D1Database, device: string, since?: string, until?: string): Promise<number[]> {
  const { results } = await db
    .prepare(
      `SELECT id FROM events WHERE device = ? AND type IN ('identify', 'solve')
       AND (? IS NULL OR ts_server >= ?) AND (? IS NULL OR ts_server <= ?) ORDER BY id`,
    )
    .bind(device, since ?? null, since ?? null, until ?? null, until ?? null)
    .all<{ id: number }>();
  return results.map((r) => r.id);
}

export async function existingIds(db: D1Database, ids: number[]): Promise<number[]> {
  if (!ids.length) return [];
  const { results } = await db
    .prepare(`SELECT id FROM events WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY id`)
    .bind(...ids)
    .all<{ id: number }>();
  return results.map((r) => r.id);
}
