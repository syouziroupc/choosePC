PRAGMA foreign_keys = ON;

-- Existing rows may have no explicit expiry or an expiry beyond the neutral 30-day freshness
-- policy. Normalize them once so every downstream path sees the same maximum lifetime.
UPDATE merchant_offers
SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', observed_at, '+30 days')
WHERE expires_at IS NULL
   OR datetime(expires_at) > datetime(observed_at, '+30 days');

CREATE INDEX IF NOT EXISTS idx_offers_freshness
ON merchant_offers(observed_at DESC, expires_at);

CREATE TRIGGER IF NOT EXISTS merchant_offers_reject_early_expiry_insert
BEFORE INSERT ON merchant_offers
WHEN NEW.expires_at IS NOT NULL
  AND datetime(NEW.expires_at) < datetime(NEW.observed_at)
BEGIN
  SELECT RAISE(ABORT, 'merchant offer expires before observation');
END;

CREATE TRIGGER IF NOT EXISTS merchant_offers_reject_early_expiry_update
BEFORE UPDATE OF observed_at, expires_at ON merchant_offers
WHEN NEW.expires_at IS NOT NULL
  AND datetime(NEW.expires_at) < datetime(NEW.observed_at)
BEGIN
  SELECT RAISE(ABORT, 'merchant offer expires before observation');
END;

CREATE TRIGGER IF NOT EXISTS merchant_offers_cap_expiry_insert
AFTER INSERT ON merchant_offers
WHEN NEW.expires_at IS NULL
   OR datetime(NEW.expires_at) > datetime(NEW.observed_at, '+30 days')
BEGIN
  UPDATE merchant_offers
  SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', NEW.observed_at, '+30 days')
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS merchant_offers_cap_expiry_update
AFTER UPDATE OF observed_at, expires_at ON merchant_offers
WHEN NEW.expires_at IS NULL
   OR datetime(NEW.expires_at) > datetime(NEW.observed_at, '+30 days')
BEGIN
  UPDATE merchant_offers
  SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', NEW.observed_at, '+30 days')
  WHERE id = NEW.id;
END;
