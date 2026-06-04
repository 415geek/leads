-- P1a (revised): lead_evidence + leads owner/store columns
-- Does NOT recreate lead_contacts (see v2_pro). Safe to re-run (IF NOT EXISTS).
-- Apply manually in Supabase SQL Editor; not auto-run on Vercel deploy.

-- ---------------------------------------------------------------------------
-- 1. lead_evidence — multi-source facts with provenance
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS lead_evidence (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id         uuid        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  field           text        NOT NULL,
  value           text        NOT NULL,
  source          text        NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  confidence_raw  numeric,
  raw_payload     jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_evidence_field_check CHECK (
    field IN (
      'owner_name', 'owner_entity', 'phone', 'email',
      'is_new_store', 'address'
    )
  ),
  CONSTRAINT lead_evidence_source_check CHECK (
    source IN (
      'attom', 'regrid', 'reonomy', 'ca_sos', 'abc', 'business_license',
      'batchdata', 'reiskip', 'tracerfy', 'manual', 'whitepages',
      'opencorporates', 'pipeline'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_lead_evidence_lead_id_field
  ON lead_evidence(lead_id, field);

COMMENT ON TABLE lead_evidence IS 'Per-field evidence from external sources; consumed by cross-validate (P3).';

-- ---------------------------------------------------------------------------
-- 2. leads — owner / parcel / new-store signals (denormalized for list filters)
-- ---------------------------------------------------------------------------

ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner_entity_name text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner_person_name text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS apn text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS store_status text NOT NULL DEFAULT 'unknown';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS new_store_confidence int;

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_store_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_store_status_check CHECK (
  store_status IN ('new', 'old', 'renewal', 'unknown')
);

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_new_store_confidence_check;
ALTER TABLE leads ADD CONSTRAINT leads_new_store_confidence_check CHECK (
  new_store_confidence IS NULL OR (new_store_confidence >= 0 AND new_store_confidence <= 100)
);

COMMENT ON COLUMN leads.owner_entity_name IS 'Legal entity (LLC/Inc); may differ from restaurant DBA.';
COMMENT ON COLUMN leads.owner_person_name IS 'Natural person owner when identified across sources.';
COMMENT ON COLUMN leads.apn IS 'Assessor parcel number when known.';
COMMENT ON COLUMN leads.store_status IS 'new | old | renewal | unknown — from permit/license signals.';
COMMENT ON COLUMN leads.new_store_confidence IS '0-100 confidence for new opening (P3/P4).';

-- Extend lead_contacts.source for evidence pipeline (v2_pro CHECK)
ALTER TABLE lead_contacts DROP CONSTRAINT IF EXISTS lead_contacts_source_check;
ALTER TABLE lead_contacts ADD CONSTRAINT lead_contacts_source_check CHECK (
  source IN (
    'opencorporates', 'tx_sos', 'google', 'inferred',
    'evidence_scoring', 'batchdata', 'whitepages'
  )
);
