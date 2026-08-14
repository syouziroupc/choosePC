PRAGMA foreign_keys = ON;

ALTER TABLE commercial_programs ADD COLUMN click_ref_param TEXT;
ALTER TABLE outbound_clicks ADD COLUMN program_id TEXT;
ALTER TABLE conversion_events ADD COLUMN program_id TEXT;
ALTER TABLE conversion_events ADD COLUMN offer_id TEXT;
ALTER TABLE conversion_events ADD COLUMN metadata_json TEXT;

CREATE INDEX IF NOT EXISTS idx_outbound_clicks_clicked_at
  ON outbound_clicks(clicked_at);

CREATE INDEX IF NOT EXISTS idx_outbound_clicks_program
  ON outbound_clicks(program_id, clicked_at);

CREATE INDEX IF NOT EXISTS idx_conversion_events_occurred_at
  ON conversion_events(occurred_at);

CREATE INDEX IF NOT EXISTS idx_conversion_events_program
  ON conversion_events(program_id, occurred_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversion_provider_reference
  ON conversion_events(provider, external_reference)
  WHERE external_reference IS NOT NULL;
