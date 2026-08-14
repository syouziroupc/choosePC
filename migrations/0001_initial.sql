PRAGMA foreign_keys = ON;

CREATE TABLE knowledge_versions (
  version TEXT PRIMARY KEY,
  git_sha TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE hardware_cpu (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL UNIQUE,
  manufacturer TEXT NOT NULL,
  family TEXT,
  generation TEXT,
  cores INTEGER,
  threads INTEGER,
  release_date TEXT,
  general_score REAL,
  single_score REAL,
  multi_score REAL,
  efficiency_score REAL,
  knowledge_version TEXT NOT NULL,
  source_json TEXT NOT NULL,
  FOREIGN KEY (knowledge_version) REFERENCES knowledge_versions(version)
);

CREATE TABLE hardware_gpu (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  manufacturer TEXT NOT NULL,
  variant TEXT NOT NULL CHECK (variant IN ('desktop','laptop','integrated','unknown')),
  architecture TEXT,
  vram_mb INTEGER,
  score_1080 REAL,
  score_1440 REAL,
  score_4k REAL,
  compute_score REAL,
  knowledge_version TEXT NOT NULL,
  source_json TEXT NOT NULL,
  UNIQUE(canonical_name, variant),
  FOREIGN KEY (knowledge_version) REFERENCES knowledge_versions(version)
);

CREATE TABLE device_models (
  id TEXT PRIMARY KEY,
  manufacturer TEXT NOT NULL,
  model TEXT NOT NULL,
  category TEXT NOT NULL,
  release_date TEXT,
  base_weight_g INTEGER,
  base_battery_wh REAL,
  flexible_spec_json TEXT NOT NULL DEFAULT '{}',
  knowledge_version TEXT NOT NULL,
  source_json TEXT NOT NULL,
  UNIQUE(manufacturer, model),
  FOREIGN KEY (knowledge_version) REFERENCES knowledge_versions(version)
);

CREATE TABLE device_variants (
  id TEXT PRIMARY KEY,
  device_model_id TEXT,
  variant_name TEXT,
  cpu_id TEXT,
  gpu_id TEXT,
  ram_mb INTEGER,
  storage_mb INTEGER,
  gpu_tgp_w REAL,
  spec_json TEXT NOT NULL DEFAULT '{}',
  knowledge_version TEXT NOT NULL,
  FOREIGN KEY (device_model_id) REFERENCES device_models(id),
  FOREIGN KEY (cpu_id) REFERENCES hardware_cpu(id),
  FOREIGN KEY (gpu_id) REFERENCES hardware_gpu(id),
  FOREIGN KEY (knowledge_version) REFERENCES knowledge_versions(version)
);

CREATE TABLE usecase_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  requirements_json TEXT NOT NULL,
  weights_json TEXT NOT NULL,
  knowledge_version TEXT NOT NULL,
  FOREIGN KEY (knowledge_version) REFERENCES knowledge_versions(version)
);

CREATE TABLE game_profiles (
  id TEXT PRIMARY KEY,
  game_name TEXT NOT NULL,
  resolution TEXT NOT NULL,
  preset TEXT NOT NULL,
  target_fps_class TEXT NOT NULL,
  requirements_json TEXT NOT NULL,
  knowledge_version TEXT NOT NULL,
  source_json TEXT NOT NULL,
  FOREIGN KEY (knowledge_version) REFERENCES knowledge_versions(version)
);

CREATE TABLE market_observations (
  id TEXT PRIMARY KEY,
  product_signature TEXT NOT NULL,
  source TEXT NOT NULL,
  merchant TEXT,
  price_jpy INTEGER NOT NULL CHECK(price_jpy >= 0),
  condition_type TEXT NOT NULL,
  cpu_id TEXT,
  gpu_id TEXT,
  ram_mb INTEGER,
  storage_mb INTEGER,
  similarity_json TEXT NOT NULL DEFAULT '{}',
  observed_at TEXT NOT NULL,
  url_hash TEXT,
  raw_snapshot_key TEXT,
  FOREIGN KEY (cpu_id) REFERENCES hardware_cpu(id),
  FOREIGN KEY (gpu_id) REFERENCES hardware_gpu(id)
);

CREATE INDEX idx_market_signature_date ON market_observations(product_signature, observed_at DESC);
CREATE INDEX idx_market_cpu_gpu ON market_observations(cpu_id, gpu_id, observed_at DESC);

CREATE TABLE merchant_offers (
  id TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  title TEXT NOT NULL,
  price_jpy INTEGER NOT NULL CHECK(price_jpy >= 0),
  product_url TEXT NOT NULL,
  affiliate_url TEXT,
  stock_state TEXT,
  product_signature TEXT,
  normalized_pc_json TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE INDEX idx_offers_signature_price ON merchant_offers(product_signature, price_jpy);

CREATE TABLE url_analysis_cache (
  url_hash TEXT PRIMARY KEY,
  merchant TEXT,
  normalized_pc_json TEXT,
  parser_name TEXT,
  parser_version TEXT,
  status TEXT NOT NULL,
  analyzed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE evaluation_runs (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  input_type TEXT NOT NULL,
  category TEXT NOT NULL,
  normalized_pc_json TEXT NOT NULL,
  use_profile_json TEXT NOT NULL,
  hardware_score REAL NOT NULL,
  fit_score REAL NOT NULL,
  value_score REAL NOT NULL,
  condition_score REAL NOT NULL,
  longevity_score REAL NOT NULL,
  risk_score REAL NOT NULL,
  confidence_score REAL NOT NULL,
  overall_score REAL NOT NULL,
  decision TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  knowledge_version TEXT NOT NULL
);

CREATE INDEX idx_evaluation_created ON evaluation_runs(created_at DESC);
CREATE INDEX idx_evaluation_category ON evaluation_runs(category, created_at DESC);

CREATE TABLE evaluation_reasons (
  evaluation_id TEXT NOT NULL,
  code TEXT NOT NULL,
  severity TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (evaluation_id, code),
  FOREIGN KEY (evaluation_id) REFERENCES evaluation_runs(id) ON DELETE CASCADE
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE parser_failures (
  id TEXT PRIMARY KEY,
  url_hash TEXT NOT NULL,
  merchant TEXT,
  parser_name TEXT,
  error_code TEXT NOT NULL,
  context_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  evaluation_id TEXT,
  lead_type TEXT NOT NULL CHECK(lead_type IN ('purchase','repair','sell')),
  contact_json TEXT NOT NULL,
  request_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  estimated_gross_profit_jpy INTEGER,
  actual_gross_profit_jpy INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (evaluation_id) REFERENCES evaluation_runs(id)
);

CREATE TABLE outbound_clicks (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  evaluation_id TEXT,
  offer_id TEXT,
  merchant_type TEXT NOT NULL CHECK(merchant_type IN ('own','affiliate','normal')),
  merchant TEXT,
  clicked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (evaluation_id) REFERENCES evaluation_runs(id),
  FOREIGN KEY (offer_id) REFERENCES merchant_offers(id)
);

CREATE TABLE conversion_events (
  id TEXT PRIMARY KEY,
  outbound_click_id TEXT,
  provider TEXT NOT NULL,
  external_reference TEXT,
  gross_order_jpy INTEGER,
  commission_jpy INTEGER,
  status TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (outbound_click_id) REFERENCES outbound_clicks(id)
);

CREATE TABLE analytics_events (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  evaluation_id TEXT,
  event_name TEXT NOT NULL,
  category TEXT,
  dimensions_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (evaluation_id) REFERENCES evaluation_runs(id)
);

CREATE INDEX idx_analytics_event_date ON analytics_events(event_name, created_at DESC);
