PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS affiliate_networks (
  id TEXT PRIMARY KEY CHECK (id = 'a8'),
  display_name TEXT NOT NULL,
  selection_status TEXT NOT NULL CHECK (selection_status IN ('selected','disabled')),
  homepage_url TEXT NOT NULL,
  signup_url TEXT NOT NULL,
  notes_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO affiliate_networks (
  id, display_name, selection_status, homepage_url, signup_url, notes_json
) VALUES (
  'a8',
  'A8.net',
  'selected',
  'https://www.a8.net/',
  'https://media-console.a8.net/signup-mail-send?action=default',
  '{"singleNetwork":true,"linkManager":"supported-programs-only","amazonRakutenLinkManager":false,"amazonRakutenParameterTracking":false}'
)
ON CONFLICT(id) DO UPDATE SET
  display_name = excluded.display_name,
  selection_status = excluded.selection_status,
  homepage_url = excluded.homepage_url,
  signup_url = excluded.signup_url,
  notes_json = excluded.notes_json,
  updated_at = CURRENT_TIMESTAMP;

ALTER TABLE commercial_programs ADD COLUMN affiliate_network TEXT;
ALTER TABLE commercial_programs ADD COLUMN external_program_id TEXT;

UPDATE commercial_programs
SET affiliate_network = 'a8'
WHERE program_type = 'affiliate' AND affiliate_network IS NULL;

CREATE INDEX IF NOT EXISTS idx_commercial_program_network
  ON commercial_programs(affiliate_network, status, updated_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_commercial_program_network_guard_insert
BEFORE INSERT ON commercial_programs
FOR EACH ROW
WHEN
  (NEW.program_type = 'affiliate' AND COALESCE(NEW.affiliate_network, '') <> 'a8')
  OR (NEW.program_type <> 'affiliate' AND NEW.affiliate_network IS NOT NULL)
  OR (NEW.affiliate_network = 'a8' AND NEW.click_ref_param IS NOT NULL AND NEW.click_ref_param NOT IN ('id1','id2','id3','id4','id5'))
BEGIN
  SELECT RAISE(ABORT, 'invalid affiliate network configuration');
END;

CREATE TRIGGER IF NOT EXISTS trg_commercial_program_network_guard_update
BEFORE UPDATE OF program_type, affiliate_network, click_ref_param ON commercial_programs
FOR EACH ROW
WHEN
  (NEW.program_type = 'affiliate' AND COALESCE(NEW.affiliate_network, '') <> 'a8')
  OR (NEW.program_type <> 'affiliate' AND NEW.affiliate_network IS NOT NULL)
  OR (NEW.affiliate_network = 'a8' AND NEW.click_ref_param IS NOT NULL AND NEW.click_ref_param NOT IN ('id1','id2','id3','id4','id5'))
BEGIN
  SELECT RAISE(ABORT, 'invalid affiliate network configuration');
END;
