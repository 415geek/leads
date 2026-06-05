import type { LeadStatus } from '@/types/lead';
import type { LeadOutcomeType } from '@/types/lead-outcome';

const TERMINAL: Record<LeadStatus, LeadOutcomeType | null> = {
  new: null,
  contacted: null,
  in_progress: null,
  converted: 'won',
  not_interested: 'lost',
};

export function outcomeForStatus(status: LeadStatus): LeadOutcomeType | null {
  return TERMINAL[status] ?? null;
}

/** 是否从非终态首次进入 won/lost（避免重复落库）。 */
export function shouldRecordOutcomeTransition(
  previous: LeadStatus | null | undefined,
  next: LeadStatus,
): boolean {
  const nextOutcome = outcomeForStatus(next);
  if (!nextOutcome) return false;
  if (!previous || previous === next) return false;
  return outcomeForStatus(previous) !== nextOutcome;
}
