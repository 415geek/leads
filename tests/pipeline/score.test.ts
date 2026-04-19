import { describe, it, expect } from 'vitest';
import { scoreDraft } from '@/lib/pipeline/score';
import type { NormalizedDraft } from '@/lib/sources/types';

function today(): Date {
  return new Date();
}

function daysAgoISO(n: number): string {
  const d = today();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function makeDraft(overrides: Partial<NormalizedDraft> = {}): NormalizedDraft {
  return {
    external_id: 'ext-1',
    name: 'Test Restaurant',
    address: '123 Main St',
    phone: null,
    cuisine_type: '餐饮',
    city: 'San Francisco',
    metro_area: 'sf_bay',
    source: 'sf_gov',
    license_date: null,
    first_inspection_date: null,
    license_type: null,
    source_raw: {},
    lead_status: 'new',
    ...overrides,
  };
}

describe('scoreDraft (scoreV2)', () => {
  it('gives maximum freshness for license within 7 days', () => {
    const s = scoreDraft({
      draft: makeDraft({ license_date: daysAgoISO(3) }),
      confidence: 1.0,
      hasEnrichment: true,
    });
    // 40 (fresh) + 25 (conf=1) + 15 (sf_bay=1) + 10 (enr) + 0 (no phone) = 90
    expect(s).toBe(90);
  });

  it('handles first_inspection_date fallback when license_date is null', () => {
    const s = scoreDraft({
      draft: makeDraft({
        license_date: null,
        first_inspection_date: daysAgoISO(3),
      }),
      confidence: 1.0,
      hasEnrichment: false,
    });
    // 40 (fresh) + 25 + 15 + 0 + 0 = 80
    expect(s).toBe(80);
  });

  it('degrades freshness over time', () => {
    const s7 = scoreDraft({
      draft: makeDraft({ license_date: daysAgoISO(7) }),
      confidence: 1.0,
      hasEnrichment: false,
    });
    const s14 = scoreDraft({
      draft: makeDraft({ license_date: daysAgoISO(14) }),
      confidence: 1.0,
      hasEnrichment: false,
    });
    const s30 = scoreDraft({
      draft: makeDraft({ license_date: daysAgoISO(30) }),
      confidence: 1.0,
      hasEnrichment: false,
    });
    const s91 = scoreDraft({
      draft: makeDraft({ license_date: daysAgoISO(91) }),
      confidence: 1.0,
      hasEnrichment: false,
    });
    expect(s7).toBeGreaterThan(s14);
    expect(s14).toBeGreaterThan(s30);
    expect(s30).toBeGreaterThan(s91);
  });

  it('gives Phase 1 null confidence a 0.8 baseline (no score collapse)', () => {
    const passthrough = scoreDraft({
      draft: makeDraft({ license_date: daysAgoISO(3) }),
      confidence: null,
      hasEnrichment: false,
    });
    // 40 + 25*0.8 + 15 + 0 + 0 = 75
    expect(passthrough).toBe(75);
  });

  it('weights tier-1 metros (sf_bay/nyc/la) higher than tier-2', () => {
    const sf = scoreDraft({
      draft: makeDraft({
        metro_area: 'sf_bay',
        license_date: null,
        first_inspection_date: null,
      }),
      confidence: 1.0,
      hasEnrichment: false,
    });
    const houston = scoreDraft({
      draft: makeDraft({
        metro_area: 'houston',
        license_date: null,
        first_inspection_date: null,
      }),
      confidence: 1.0,
      hasEnrichment: false,
    });
    expect(sf).toBeGreaterThan(houston);
  });

  it('does NOT give a bonus for Chinese cuisine (Chinese is a filter, not a score)', () => {
    const chinese = scoreDraft({
      draft: makeDraft({ cuisine_type: '川菜', license_date: daysAgoISO(3) }),
      confidence: 1.0,
      hasEnrichment: false,
    });
    const western = scoreDraft({
      draft: makeDraft({ cuisine_type: 'Italian', license_date: daysAgoISO(3) }),
      confidence: 1.0,
      hasEnrichment: false,
    });
    expect(chinese).toBe(western);
  });

  it('applies DataSF new-opening bonus for sf_gov + opening_signals', () => {
    const base = scoreDraft({
      draft: makeDraft({
        license_date: daysAgoISO(3),
        opening_signals: {
          new_opening_score: 90,
          new_opening_label: 'confirmed_new_opening',
          transfer_score: 0,
          transfer_label: 'none',
          reason_codes: [],
          is_new_at_location: true,
          is_new_business_entity: true,
          normalized_address_key: 'X',
          manual_review_priority: 'low',
        },
      }),
      confidence: 1.0,
      hasEnrichment: false,
    });
    const noIntel = scoreDraft({
      draft: makeDraft({ license_date: daysAgoISO(3) }),
      confidence: 1.0,
      hasEnrichment: false,
    });
    expect(base - noIntel).toBe(10);
  });

  it('adds +10 for phone', () => {
    const withPhone = scoreDraft({
      draft: makeDraft({ phone: '415-555-1234' }),
      confidence: 1.0,
      hasEnrichment: false,
    });
    const noPhone = scoreDraft({
      draft: makeDraft({ phone: null }),
      confidence: 1.0,
      hasEnrichment: false,
    });
    expect(withPhone - noPhone).toBe(10);
  });

  it('caps at 100', () => {
    const s = scoreDraft({
      draft: makeDraft({
        license_date: daysAgoISO(1),
        phone: '415-555-1234',
        metro_area: 'nyc',
      }),
      confidence: 1.0,
      hasEnrichment: true,
    });
    expect(s).toBe(100);
  });

  it('floors at 0 (no future-panic)', () => {
    const s = scoreDraft({
      draft: makeDraft({ license_date: null, first_inspection_date: null, phone: null }),
      confidence: 0,
      hasEnrichment: false,
    });
    // 40*0 + 25*0 + 15*1 + 0 + 0 = 15
    expect(s).toBe(15);
  });

  it('gracefully handles malformed dates', () => {
    const s = scoreDraft({
      draft: makeDraft({ license_date: 'not-a-date' as string }),
      confidence: 1.0,
      hasEnrichment: false,
    });
    // fresh=0, conf=1, metro=sf_bay, no enrich, no phone
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(100);
  });

  it('treats future dates as fresh (data source error tolerance)', () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const s = scoreDraft({
      draft: makeDraft({ license_date: future.toISOString().split('T')[0] }),
      confidence: 1.0,
      hasEnrichment: false,
    });
    // 40 (fresh=1.0) + 25 + 15 + 0 + 0 = 80
    expect(s).toBe(80);
  });
});
