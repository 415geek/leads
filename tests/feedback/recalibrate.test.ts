import { describe, it, expect } from 'vitest';
import {
  buildRecalibrateReport,
  formatRecalibrateReportMarkdown,
} from '@/lib/feedback/recalibrate';
import type { LeadOutcomeRow } from '@/types/lead-outcome';

function row(partial: Partial<LeadOutcomeRow> & Pick<LeadOutcomeRow, 'outcome'>): LeadOutcomeRow {
  return {
    id: crypto.randomUUID(),
    lead_id: crypto.randomUUID(),
    outcome: partial.outcome,
    previous_status: 'in_progress',
    new_status: partial.outcome === 'won' ? 'converted' : 'not_interested',
    lead_score: partial.lead_score ?? 60,
    new_store_confidence: partial.new_store_confidence ?? null,
    store_status: partial.store_status ?? null,
    owner_person_name: partial.owner_person_name ?? null,
    source_count: partial.source_count ?? 1,
    is_chain: partial.is_chain ?? false,
    metro_area: partial.metro_area ?? 'sf_bay',
    source: partial.source ?? 'sf_gov',
    opening_snapshot: partial.opening_snapshot ?? null,
    created_at: partial.created_at ?? new Date().toISOString(),
  };
}

describe('buildRecalibrateReport', () => {
  it('computes win rate and score band breakdown', () => {
    const sample: LeadOutcomeRow[] = [
      row({ outcome: 'won', lead_score: 85, metro_area: 'sf_bay' }),
      row({ outcome: 'won', lead_score: 90, metro_area: 'sf_bay' }),
      row({ outcome: 'lost', lead_score: 40, metro_area: 'houston' }),
      row({ outcome: 'lost', lead_score: 35, metro_area: 'houston' }),
    ];
    const report = buildRecalibrateReport(sample);
    expect(report.sample_size).toBe(4);
    expect(report.won).toBe(2);
    expect(report.lost).toBe(2);
    expect(report.win_rate_pct).toBe(50);
    expect(report.by_score_band.length).toBeGreaterThan(0);
    expect(report.by_metro.some((m) => m.metro === 'sf_bay')).toBe(true);
  });

  it('suggests higher score threshold when high band converts better', () => {
    const sample: LeadOutcomeRow[] = [
      ...Array.from({ length: 4 }, () => row({ outcome: 'won', lead_score: 88 })),
      ...Array.from({ length: 4 }, () => row({ outcome: 'lost', lead_score: 30 })),
    ];
    const report = buildRecalibrateReport(sample);
    expect(report.suggestions.some((s) => s.id === 'score-threshold')).toBe(true);
  });

  it('formats markdown report', () => {
    const report = buildRecalibrateReport([row({ outcome: 'won' })]);
    const md = formatRecalibrateReportMarkdown(report);
    expect(md).toContain('Lead Outcome 重算建议');
    expect(md).toContain('建议');
  });
});
