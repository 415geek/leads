import type { LeadEvidenceSource } from '@/types/lead-evidence';

export interface IdentityNameHit {
  source: LeadEvidenceSource;
  /** Legal entity (LLC/Inc) when applicable */
  entityName: string | null;
  /** Natural person (officer / licensee) */
  personName: string | null;
  confidenceRaw: number | null;
  rawPayload?: Record<string, unknown> | null;
}

export interface IdentityConsensusResult {
  entityName: string | null;
  personName: string | null;
  /** 0–100 agreement across sources */
  agreementScore: number;
  locked: boolean;
  hits: IdentityNameHit[];
  reviewReason: string | null;
}
