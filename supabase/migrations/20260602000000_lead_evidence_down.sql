-- Rollback for 20260602000000_lead_evidence.sql (run manually if needed)

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_new_store_confidence_check;
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_store_status_check;
ALTER TABLE leads DROP COLUMN IF EXISTS new_store_confidence;
ALTER TABLE leads DROP COLUMN IF EXISTS store_status;
ALTER TABLE leads DROP COLUMN IF EXISTS apn;
ALTER TABLE leads DROP COLUMN IF EXISTS owner_person_name;
ALTER TABLE leads DROP COLUMN IF EXISTS owner_entity_name;

DROP INDEX IF EXISTS idx_lead_evidence_lead_id_field;
DROP TABLE IF EXISTS lead_evidence;
