-- Restaurant Leads Finder Pro — V2 migration
-- Idempotent: safe to run on existing production databases.
-- Run in Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- 1. New columns on leads table
-- ---------------------------------------------------------------------------

ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_count  integer    DEFAULT 1;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_ids    text[]     DEFAULT '{}';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_chain      boolean    DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS chain_name    text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS digested_at   timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS exported_at   timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS hubspot_contact_id text;

COMMENT ON COLUMN leads.source_count          IS 'Number of distinct data sources that confirmed this lead (cross-validation)';
COMMENT ON COLUMN leads.source_ids            IS 'Array of source IDs that matched (e.g. {sf_gov, berkeley_open_data})';
COMMENT ON COLUMN leads.is_chain              IS 'True if name matched a chain/franchise in the blocklist (chain-detect step)';
COMMENT ON COLUMN leads.chain_name            IS 'Matched chain name from blocklist (e.g. "McDonald''s")';
COMMENT ON COLUMN leads.digested_at           IS 'Timestamp when this lead was included in a daily digest email (NULL = not yet sent)';
COMMENT ON COLUMN leads.exported_at           IS 'Timestamp of last CRM/HubSpot export for this lead';
COMMENT ON COLUMN leads.hubspot_contact_id    IS 'HubSpot Contact object ID — set on first export, used for PATCH idempotency';

-- ---------------------------------------------------------------------------
-- 2. New indexes on leads
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_leads_source_count  ON leads(source_count DESC);
CREATE INDEX IF NOT EXISTS idx_leads_is_chain       ON leads(is_chain) WHERE is_chain = false;
CREATE INDEX IF NOT EXISTS idx_leads_digested       ON leads(digested_at NULLS FIRST);
CREATE INDEX IF NOT EXISTS idx_leads_exported       ON leads(exported_at DESC NULLS LAST);

-- ---------------------------------------------------------------------------
-- 3. lead_contacts table (normalized owner/contact info)
--    No duplicate flat columns on leads — all contact data lives here.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS lead_contacts (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id         uuid        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  role            text        DEFAULT 'owner',        -- 'owner' | 'registered_agent' | 'manager'
  phone           text,
  email           text,
  email_inferred  boolean     DEFAULT false,
  -- source values:
  --   'opencorporates' — any state sourced via OpenCorporates API
  --   'tx_sos'         — direct Texas SOSDirect API
  --   'google'         — extracted from Google Places website/phone
  --   'inferred'       — email pattern generated from domain + name
  source          text        NOT NULL CHECK (source IN ('opencorporates','tx_sos','google','inferred')),
  confidence      numeric(3,2),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_contacts_lead_id ON lead_contacts(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_contacts_source  ON lead_contacts(source);

COMMENT ON TABLE  lead_contacts                      IS 'Normalized owner/contact records. One lead may have multiple contacts from different sources.';
COMMENT ON COLUMN lead_contacts.email_inferred       IS 'True = email was pattern-inferred (not confirmed). Display with "Unverified" label in UI.';
COMMENT ON COLUMN lead_contacts.confidence           IS '0..1 confidence score; inferred emails always <= 0.4';

-- ---------------------------------------------------------------------------
-- 4. MetroArea type additions (backfill metro_area for new cities)
--    New metros: las_vegas, miami, dallas, phoenix, denver, atlanta
--    These will be populated by new adapters when they are enabled.
--    No backfill needed — new data sources will supply metro_area on ingest.
-- ---------------------------------------------------------------------------

-- Ensure existing NULL metro_area rows from known sources are backfilled
UPDATE leads SET metro_area = 'sf_bay'
  WHERE metro_area IS NULL AND source IN ('sf_gov', 'berkeley_open_data');
UPDATE leads SET metro_area = 'houston'
  WHERE metro_area IS NULL AND source IN ('houston_hdhhs', 'houston_permit_ereport', 'harris_county_dba', 'tx_sos_houston_supplement');
UPDATE leads SET metro_area = 'la'
  WHERE metro_area IS NULL AND source IN ('lacounty_restaurant_inspect', 'lacity_restaurant_inspect', 'la_county_dph');
UPDATE leads SET metro_area = 'nyc'
  WHERE metro_area IS NULL AND source = 'nyc_dohmh';
UPDATE leads SET metro_area = 'chicago'
  WHERE metro_area IS NULL AND source = 'chicago_food_inspect';
UPDATE leads SET metro_area = 'austin'
  WHERE metro_area IS NULL AND source = 'austin_food_inspect';
UPDATE leads SET metro_area = 'seattle'
  WHERE metro_area IS NULL AND source IN ('seattle_food_inspect', 'king_county_food');
UPDATE leads SET metro_area = 'boston'
  WHERE metro_area IS NULL AND source = 'boston_food_inspect';

-- ---------------------------------------------------------------------------
-- 5. Backfill source_count = 1 for existing rows (no cross-validation history)
-- ---------------------------------------------------------------------------

UPDATE leads SET source_count = 1 WHERE source_count IS NULL OR source_count = 0;
UPDATE leads SET source_ids = ARRAY[source] WHERE source_ids IS NULL OR source_ids = '{}';
