-- PC ASSIST governance, provenance and recommendation tables.
-- Evaluation facts and commercial metadata are deliberately stored separately.

CREATE TABLE IF NOT EXISTS source_documents (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  publisher TEXT NOT NULL,
  title TEXT,
  retrieved_at TEXT NOT NULL,
  license_note TEXT,
  content_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS knowledge_evidence (
  knowledge_type TEXT NOT NULL,
  knowledge_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  source_document_id TEXT NOT NULL,
  evidence_kind TEXT NOT NULL CHECK (evidence_kind IN ('manufacturer','official_docs','licensed_benchmark','measured','curated','other')),
  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (knowledge_type, knowledge_id, field_name, source_document_id),
  FOREIGN KEY (source_document_id) REFERENCES source_documents(id)
);

CREATE TABLE IF NOT EXISTS market_estimates (
  id TEXT PRIMARY KEY,
  product_signature TEXT NOT NULL,
  fair_price_jpy INTEGER NOT NULL CHECK (fair_price_jpy >= 0),
  low_price_jpy INTEGER,
  high_price_jpy INTEGER,
  sample_count INTEGER NOT NULL DEFAULT 0 CHECK (sample_count >= 0),
  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  computed_at TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  filters_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_market_estimates_signature_time
  ON market_estimates(product_signature, computed_at DESC);

CREATE TABLE IF NOT EXISTS recommendation_runs (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  usecase_json TEXT NOT NULL,
  ranked_candidates_json TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  knowledge_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS commercial_programs (
  id TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  program_type TEXT NOT NULL CHECK (program_type IN ('own','affiliate','normal')),
  status TEXT NOT NULL CHECK (status IN ('active','paused','unknown')),
  commission_json TEXT,
  disclosure_text TEXT,
  source_url TEXT,
  last_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attribution_links (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL,
  program_id TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (program_id) REFERENCES commercial_programs(id)
);

CREATE INDEX IF NOT EXISTS idx_attribution_offer ON attribution_links(offer_id);
