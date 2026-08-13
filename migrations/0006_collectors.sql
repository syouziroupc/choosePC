PRAGMA foreign_keys = ON;

CREATE TABLE collector_sources (
  id TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  product_url TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL CHECK(mode IN ('offer','market','both')),
  category TEXT NOT NULL,
  condition_type TEXT NOT NULL CHECK(condition_type IN ('new','used','refurbished','unknown')),
  warranty_days INTEGER CHECK(warranty_days IS NULL OR (warranty_days >= 0 AND warranty_days <= 3650)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  refresh_minutes INTEGER NOT NULL DEFAULT 360 CHECK(refresh_minutes >= 60 AND refresh_minutes <= 10080),
  next_run_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_run_at TEXT,
  last_success_at TEXT,
  last_status TEXT NOT NULL DEFAULT 'pending',
  failure_count INTEGER NOT NULL DEFAULT 0 CHECK(failure_count >= 0),
  last_error TEXT,
  parser_name TEXT,
  parser_version TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_collector_sources_due
  ON collector_sources(enabled, next_run_at);

CREATE INDEX idx_collector_sources_merchant
  ON collector_sources(merchant, enabled, last_success_at DESC);

CREATE TABLE collector_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL CHECK(status IN ('running','success','partial','failed','skipped')),
  parser_name TEXT,
  parser_version TEXT,
  extracted_title TEXT,
  extracted_price_jpy INTEGER,
  stock_state TEXT,
  market_observation_id TEXT,
  offer_id TEXT,
  error_code TEXT,
  extraction_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(source_id) REFERENCES collector_sources(id) ON DELETE CASCADE
);

CREATE INDEX idx_collector_runs_source_started
  ON collector_runs(source_id, started_at DESC);

CREATE INDEX idx_collector_runs_status_started
  ON collector_runs(status, started_at DESC);
