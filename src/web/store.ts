import { ApiError, getProgress, postEvent } from './api.ts';
import { solveKey, type EventInput, type GameId, type SolveKey, type SolveRecord } from '../core/types.ts';

/**
 * babe    — progress lives on the server (append-only log), with an offline outbox
 * guest   — progress lives in this browser only, and can be wiped
 * preview — admin play-testing; nothing is kept
 */
export type Role = 'babe' | 'guest' | 'preview';

const LS = (() => {
  try {
    const t = '__advent_probe__';
    localStorage.setItem(t, t);
    localStorage.removeItem(t);
    return localStorage;
  } catch {
    return null;
  }
})();

export const lsGet = (k: string): string | null => LS?.getItem(k) ?? null;
export const lsSet = (k: string, v: string): void => {
  try {
    LS?.setItem(k, v);
  } catch {
    /* storage full or blocked */
  }
};
export const lsDel = (k: string): void => LS?.removeItem(k);

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join('-');
}

/**
 * The babe key from the link `/#/babe/<key>`. Babe mode needs it: without it, "Yes" at the gate asks for
 * the link instead. It outlives "Not babe?", so the same device can switch back without the link.
 */
const BABE_KEY = 'advent.babeKey';
export const babeKey = (): string | null => lsGet(BABE_KEY);
export const setBabeKey = (k: string): void => lsSet(BABE_KEY, k);
/** The server turned the key down (it was changed): forget it, so the gate asks for the new link. */
const dropBabeKey = (e: unknown): void => {
  if (e instanceof ApiError && e.status === 401) lsDel(BABE_KEY);
};

export function getRole(): Role | null {
  if (sessionStorage.getItem('advent.preview')) return 'preview';
  const r = lsGet('advent.role');
  if (r === 'babe') return babeKey() ? 'babe' : null;
  return r === 'guest' ? r : null;
}

export function setRole(r: 'babe' | 'guest'): void {
  lsSet('advent.role', r);
}

export function clearRole(): void {
  lsDel('advent.role');
}

export function deviceId(): string {
  let d = lsGet('advent.device');
  if (!d) {
    d = newId();
    lsSet('advent.device', d);
  }
  return d;
}

export function previewToken(): string | null {
  return sessionStorage.getItem('advent.preview');
}

// ---- Stores ----

export interface Store {
  role: Role;
  load(): Promise<Map<SolveKey, SolveRecord>>;
  record(rec: SolveRecord): Promise<SolveRecord>;
  wipe(): void;
  /** Unsynced solves (babe only). */
  pending(): number;
}

const toMap = (list: SolveRecord[]) => new Map(list.map((s) => [solveKey(s.day, s.game), s] as const));

class LocalStore implements Store {
  role = 'guest' as const;
  private key = 'advent.guest.solves';
  private read(): SolveRecord[] {
    try {
      return JSON.parse(lsGet(this.key) ?? '[]');
    } catch {
      return [];
    }
  }
  async load() {
    return toMap(this.read());
  }
  async record(rec: SolveRecord) {
    const list = this.read().filter((s) => !(s.day === rec.day && s.game === rec.game));
    list.push(rec);
    lsSet(this.key, JSON.stringify(list));
    return rec;
  }
  wipe() {
    for (let i = (LS?.length ?? 0) - 1; i >= 0; i--) {
      const k = LS!.key(i);
      if (k?.startsWith('advent.guest.')) LS!.removeItem(k);
    }
  }
  pending() {
    return 0;
  }
}

interface Outgoing {
  event: EventInput;
  rec: SolveRecord;
}

class RemoteStore implements Store {
  role = 'babe' as const;
  private outboxKey = 'advent.babe.outbox';
  private cacheKey = 'advent.babe.cache';

  private outbox(): Outgoing[] {
    try {
      return JSON.parse(lsGet(this.outboxKey) ?? '[]');
    } catch {
      return [];
    }
  }

  private flushing: Promise<void> | null = null;

  private flush(): Promise<void> {
    return (this.flushing ??= this.doFlush().finally(() => (this.flushing = null)));
  }

  private async doFlush(): Promise<void> {
    const done = new Set<string>();
    for (const item of this.outbox()) {
      const key = babeKey();
      if (!key) break;
      try {
        await postEvent(item.event, key);
        done.add(item.event.clientId);
      } catch (e) {
        // 4xx: the server will never take it (e.g. puzzle removed), so drop it. Network errors retry later,
        // and so does a turned-down key (401): the solve waits for the new link.
        const status = (e as { status?: number }).status;
        dropBabeKey(e);
        if (status && status < 500 && status !== 401) {
          console.warn(`solve for day ${item.event.day} ${item.event.game} refused: ${(e as Error).message}`);
          done.add(item.event.clientId);
        }
      }
    }
    lsSet(this.outboxKey, JSON.stringify(this.outbox().filter((i) => !done.has(i.event.clientId))));
  }

  async load() {
    await this.flush();
    let list: SolveRecord[];
    try {
      list = (await getProgress(babeKey() ?? '')).solves;
      lsSet(this.cacheKey, JSON.stringify(list));
    } catch (e) {
      dropBabeKey(e);
      list = JSON.parse(lsGet(this.cacheKey) ?? '[]');
    }
    // Solves still waiting in the outbox count locally until the server has them.
    for (const { rec } of this.outbox()) {
      if (!list.some((s) => s.day === rec.day && s.game === rec.game)) list.push(rec);
    }
    return toMap(list);
  }

  async record(rec: SolveRecord) {
    const event: EventInput = {
      type: 'solve',
      clientId: newId(),
      device: deviceId(),
      tsClient: rec.tsClient,
      day: rec.day,
      game: rec.game,
      rev: rec.rev,
      payload: rec.payload,
    };
    lsSet(this.outboxKey, JSON.stringify([...this.outbox(), { event, rec }]));
    await this.flush();
    if (this.outbox().some((i) => i.event.clientId === event.clientId)) await this.flush();
    return rec;
  }

  wipe() {
    /* babe's progress is only changed from the admin page */
  }

  pending() {
    return this.outbox().length;
  }
}

class MemoryStore implements Store {
  role = 'preview' as const;
  private map = new Map<SolveKey, SolveRecord>();
  async load() {
    return new Map(this.map);
  }
  async record(rec: SolveRecord) {
    this.map.set(solveKey(rec.day, rec.game), rec);
    return rec;
  }
  wipe() {
    this.map.clear();
  }
  pending() {
    return 0;
  }
}

let previewStore: MemoryStore | null = null;

export function storeFor(role: Role): Store {
  if (role === 'babe') return new RemoteStore();
  if (role === 'guest') return new LocalStore();
  return (previewStore ??= new MemoryStore());
}

export function identify(): void {
  const key = babeKey();
  if (key) postEvent({ type: 'identify', clientId: newId(), device: deviceId(), tsClient: new Date().toISOString() }, key).catch(() => {});
}

// ---- Work in progress (device-local, per puzzle revision) ----

const wipKey = (role: Role, day: number, game: GameId, rev: string) => `advent.${role}.wip.${day}.${game}.${rev}`;
const memWip = new Map<string, string>();

export function loadWip<T>(role: Role, day: number, game: GameId, rev: string): T | null {
  const k = wipKey(role, day, game, rev);
  const raw = role === 'preview' ? memWip.get(k) : lsGet(k);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveWip(role: Role, day: number, game: GameId, rev: string, value: unknown): void {
  const k = wipKey(role, day, game, rev);
  const raw = JSON.stringify(value);
  if (role === 'preview') {
    memWip.set(k, raw);
    return;
  }
  lsSet(k, raw);
  // Drop drafts saved against older revisions of this puzzle.
  const prefix = `advent.${role}.wip.${day}.${game}.`;
  for (let i = (LS?.length ?? 0) - 1; i >= 0; i--) {
    const other = LS!.key(i);
    if (other && other.startsWith(prefix) && other !== k) LS!.removeItem(other);
  }
}

export function clearWip(role: Role, day: number, game: GameId, rev: string): void {
  const k = wipKey(role, day, game, rev);
  if (role === 'preview') memWip.delete(k);
  else lsDel(k);
}
