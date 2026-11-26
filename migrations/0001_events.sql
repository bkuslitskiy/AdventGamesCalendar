-- Append-only event log. Progress is computed by replaying it; nothing is ever updated or deleted.
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,  -- monotonic: replay order
  client_id  TEXT UNIQUE,                        -- idempotency key from the device (outbox retries)
  ts_server  TEXT NOT NULL,                      -- ISO 8601 UTC
  ts_client  TEXT,                               -- ISO 8601 UTC, server-synced device clock
  device     TEXT NOT NULL,                      -- device UUID, or 'admin'
  ua         TEXT,
  type       TEXT NOT NULL CHECK (type IN ('identify', 'solve', 'reset', 'void')),
  day        INTEGER CHECK (day IS NULL OR day BETWEEN 1 AND 31),
  game       TEXT,                               -- game id; checked by the API (isGameId), so new games need no migration
  rev        TEXT,                               -- content hash of the puzzle as played
  payload    TEXT                                -- JSON: solve {board, stats}; void {ids, reason}
);

CREATE INDEX IF NOT EXISTS events_day_game ON events (day, game, id);
