import { describe, expect, it } from 'vitest';
import { ownerSearchResultsToEvidence } from '@/lib/evidence/owner-search-to-evidence';
import { scoreContactChannels } from '@/lib/scoring/score-contact';
import { CONTACT_SCORE_CONFIG } from '@/lib/scoring/contact-score-config';
import type { WhitepagesPersonRecord } from '@/lib/whitepages/owner-search';

const LEAD_ID = 'lead-uuid-1';

function wpRecord(overrides: Record<string, unknown> = {}): WhitepagesPersonRecord {
  return {
    id: 'wp-1',
    name: 'Jane Owner',
    match_score: 72,
    company_name: 'Lu Kitchen LLC',
    phones: [{ number: '5551112222', type: 'mobile', score: 80 }],
    emails: ['jane@example.com'],
    ...overrides,
  };
}

describe('ownerSearchResultsToEvidence', () => {
  it('maps Whitepages hits to phone/email/owner evidence rows', () => {
    const rows = ownerSearchResultsToEvidence(LEAD_ID, [wpRecord()]);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.some((r) => r.field === 'phone' && r.source === 'whitepages')).toBe(true);
    expect(rows.some((r) => r.field === 'email' && r.value === 'jane@example.com')).toBe(true);
    expect(rows.every((r) => r.lead_id === LEAD_ID)).toBe(true);
  });

  it('adds OpenCorporates rows from keyword analysis evidence', () => {
    const rows = ownerSearchResultsToEvidence(LEAD_ID, [wpRecord()], {
      keywordAnalysisApplied: true,
      analyses: {
        'wp-1': {
          keyword_match_score: 85,
          summary_zh: '匹配',
          matched_signals: ['LLC'],
          rationale_zh: '',
          evidence: [
            {
              title: 'CA BizFile',
              url: 'https://bizfileonline.sos.ca.gov/filing/123',
            },
          ],
        },
      },
    });
    expect(rows.some((r) => r.source === 'opencorporates' && r.field === 'owner_entity')).toBe(
      true,
    );
  });
});

describe('owner evidence → scoreContactChannels', () => {
  it('single weak whitepages phone scores below usable', () => {
    const evidence = ownerSearchResultsToEvidence(LEAD_ID, [
      wpRecord({ phones: [{ number: '5550000001', score: 30 }] }),
    ]);
    const phoneRows = evidence.filter((r) => r.field === 'phone');
    const scored = scoreContactChannels(phoneRows);
    expect(scored[0].sourceCount).toBe(1);
    expect(scored[0].confidence).toBeLessThan(CONTACT_SCORE_CONFIG.thresholds.usable);
  });

  it('whitepages + opencorporates-style second source can reach review or usable band', () => {
    const evidence = [
      {
        field: 'phone' as const,
        value: '5551112222',
        source: 'whitepages',
        confidence_raw: 85,
        raw_payload: { type: 'mobile', isMobile: true },
      },
      {
        field: 'phone' as const,
        value: '(555) 111-2222',
        source: 'batchdata',
        confidence_raw: 0.9,
        raw_payload: { type: 'mobile', isMobile: true },
      },
    ];
    const scored = scoreContactChannels(evidence);
    expect(scored[0].sourceCount).toBe(2);
    expect(scored[0].confidence).toBeGreaterThanOrEqual(CONTACT_SCORE_CONFIG.thresholds.review);
  });

  it('owner locked bonus applies after multi-source email evidence', () => {
    const evidence = [
      { field: 'email' as const, value: 'jane@example.com', source: 'whitepages', confidence_raw: 80, raw_payload: null },
      { field: 'email' as const, value: 'jane@example.com', source: 'opencorporates', confidence_raw: 75, raw_payload: null },
    ];
    const base = scoreContactChannels(evidence);
    const boosted = scoreContactChannels(evidence, { ownerPersonLocked: true });
    expect(boosted[0].confidence).toBeGreaterThan(base[0].confidence);
  });
});
