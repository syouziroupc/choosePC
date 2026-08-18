PRAGMA foreign_keys = ON;

ALTER TABLE commercial_programs ADD COLUMN program_key TEXT;

CREATE TABLE IF NOT EXISTS api_request_metrics (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  status INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (day, path, method, status)
);

CREATE INDEX IF NOT EXISTS idx_api_request_metrics_day
  ON api_request_metrics(day DESC);

CREATE INDEX IF NOT EXISTS idx_api_request_metrics_path_day
  ON api_request_metrics(path, day DESC);
