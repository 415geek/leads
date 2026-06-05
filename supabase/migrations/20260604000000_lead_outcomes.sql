-- Step 6: win/lost feedback outcomes (ENABLE_LEAD_FEEDBACK=1)
-- Apply manually in Supabase SQL Editor; not auto-run on Vercel deploy.

CREATE TABLE IF NOT EXISTS lead_outcomes (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id               uuid        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  outcome               text        NOT NULL,
  previous_status       text,
  new_status            text        NOT NULL,
  lead_score            int,
  new_store_confidence  int,
  store_status          text,
  owner_person_name     text,
  source_count          int,
  is_chain              boolean,
  metro_area            text,
  source                text,
  opening_snapshot      jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_outcomes_outcome_check CHECK (outcome IN ('won', 'lost'))
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_outcomes_lead_outcome_unique
  ON lead_outcomes(lead_id, outcome);

CREATE INDEX IF NOT EXISTS idx_lead_outcomes_created_at
  ON lead_outcomes(created_at DESC);

COMMENT ON TABLE lead_outcomes IS 'CRM won/lost snapshots for offline recalibrate.mts; one row per lead per outcome type.';
