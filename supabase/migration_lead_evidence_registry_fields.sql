-- Extend lead_evidence.field for CA SOS / registry detail rows.
-- Apply manually in Supabase SQL Editor (not auto-run on Vercel deploy).

ALTER TABLE lead_evidence DROP CONSTRAINT IF EXISTS lead_evidence_field_check;
ALTER TABLE lead_evidence ADD CONSTRAINT lead_evidence_field_check CHECK (
  field IN (
    'owner_name', 'owner_entity', 'phone', 'email',
    'is_new_store', 'address',
    'entity_number', 'entity_status', 'filing_date', 'entity_type',
    'jurisdiction', 'registered_address', 'agent_name', 'agent_address',
    'officer_role'
  )
);
