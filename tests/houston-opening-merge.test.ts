import { describe, it, expect } from 'vitest';
import {
  diceCoefficientSimilarity,
  isLikelyHoustonChainName,
  matchesHoustonRestaurantKeyword,
  normalizeHoustonAddressKey,
} from '@/lib/houston-opening-intel';
import { mergeHoustonCrossSourceLeads } from '@/lib/pipeline/houston-merge';
import type { PipelineLead } from '@/lib/pipeline/run';

describe('houston-opening-intel', () => {
  it('matches restaurant keywords', () => {
    const m = matchesHoustonRestaurantKeyword('Taco Libre Kitchen');
    expect(m.ok).toBe(true);
    expect(m.hits.length).toBeGreaterThan(0);
  });

  it('detects chain hints', () => {
    expect(isLikelyHoustonChainName('Starbucks #10234')).toBe(true);
    expect(isLikelyHoustonChainName('Little Dragon Noodle Bar')).toBe(false);
  });

  it('normalizes address keys for grouping', () => {
    expect(normalizeHoustonAddressKey('123 Main Street', 'Houston')).toBe(
      normalizeHoustonAddressKey('123 Main St', 'houston'),
    );
  });

  it('dice similarity crosses 0.85 for minor spelling variants', () => {
    const s = diceCoefficientSimilarity('Ramen House Houston', 'Ramen House Huston');
    expect(s).toBeGreaterThanOrEqual(0.85);
  });
});

describe('mergeHoustonCrossSourceLeads', () => {
  function base(overrides: Partial<PipelineLead>): PipelineLead {
    return {
      external_id: 'e1',
      name: 'Taco Libre',
      address: '100 Main Street',
      phone: null,
      cuisine_type: 'x',
      city: 'Houston',
      metro_area: 'houston',
      source: 'harris_county_dba',
      license_date: '2026-01-01',
      first_inspection_date: null,
      license_type: null,
      source_raw: {},
      lead_status: 'new',
      lead_score: 50,
      is_restaurant_confidence: null,
      ai_classification: null,
      ...overrides,
    };
  }

  it('merges DBA into HDHHS when address matches and names similar', () => {
    const dba = base({
      source: 'harris_county_dba',
      external_id: 'dba-1',
    });
    const hdhhs = base({
      source: 'houston_hdhhs',
      external_id: 'pe-9',
      name: 'Taco Libre',
      address: '100 Main St',
    });
    const out = mergeHoustonCrossSourceLeads([dba, hdhhs]);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('houston_hdhhs');
    const cls = out[0].ai_classification as Record<string, unknown>;
    expect(cls.merged_sources).toContain('harris_county_dba');
  });

  it('does not merge SF metro leads', () => {
    const sf = base({ metro_area: 'sf_bay', city: 'SF', source: 'sf_gov' });
    const out = mergeHoustonCrossSourceLeads([sf]);
    expect(out).toEqual([sf]);
  });
});
