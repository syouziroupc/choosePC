PRAGMA foreign_keys = ON;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attribution_offer_program
  ON attribution_links(offer_id, program_id);

CREATE INDEX IF NOT EXISTS idx_commercial_program_lookup
  ON commercial_programs(merchant, status, program_type);

CREATE TRIGGER IF NOT EXISTS trg_attribution_offer_program_guard_insert
BEFORE INSERT ON attribution_links
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM merchant_offers mo
  JOIN commercial_programs cp ON cp.id = NEW.program_id
  WHERE mo.id = NEW.offer_id
    AND lower(trim(mo.merchant)) = lower(trim(cp.merchant))
)
BEGIN
  SELECT RAISE(ABORT, 'attribution offer/program merchant mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_attribution_offer_program_guard_update
BEFORE UPDATE OF offer_id, program_id ON attribution_links
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM merchant_offers mo
  JOIN commercial_programs cp ON cp.id = NEW.program_id
  WHERE mo.id = NEW.offer_id
    AND lower(trim(mo.merchant)) = lower(trim(cp.merchant))
)
BEGIN
  SELECT RAISE(ABORT, 'attribution offer/program merchant mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_attribution_cleanup_offer_delete
AFTER DELETE ON merchant_offers
FOR EACH ROW
BEGIN
  DELETE FROM attribution_links WHERE offer_id = OLD.id;
END;
