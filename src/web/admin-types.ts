import type { LogEvent } from '../core/types.ts';

export interface AdminEventView extends LogEvent {
  clientId: string | null;
  ua: string | null;
}
