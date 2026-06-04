/** Multi-source evidence row (supabase lead_evidence). */

export type LeadEvidenceField =
  | 'owner_name'
  | 'owner_entity'
  | 'phone'
  | 'email'
  | 'is_new_store'
  | 'address';

export type LeadEvidenceSource =
  | 'attom'
  | 'regrid'
  | 'reonomy'
  | 'ca_sos'
  | 'abc'
  | 'business_license'
  | 'batchdata'
  | 'reiskip'
  | 'tracerfy'
  | 'manual'
  | 'whitepages'
  | 'opencorporates'
  | 'pipeline';

export type LeadStoreStatus = 'new' | 'old' | 'renewal' | 'unknown';

export interface LeadEvidence {
  id: string;
  lead_id: string;
  field: LeadEvidenceField;
  value: string;
  source: LeadEvidenceSource;
  fetched_at: string;
  confidence_raw: number | null;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
}

export interface LeadEvidenceInsert {
  lead_id: string;
  field: LeadEvidenceField;
  value: string;
  source: LeadEvidenceSource;
  fetched_at?: string;
  confidence_raw?: number | null;
  raw_payload?: Record<string, unknown> | null;
}
