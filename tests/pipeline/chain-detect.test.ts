/**
 * Chain detection golden set tests.
 *
 * Each SHOULD_DETECT case: blocklist entry clearly matches name.
 * Each SHOULD_NOT_DETECT case: indie restaurant that should not be flagged.
 */

import { describe, it, expect } from 'vitest';
import { detectChain } from '@/lib/pipeline/chain-detect';
import type { CrossValidatedDraft } from '@/lib/pipeline/cross-validate';
import type { NormalizedDraft } from '@/lib/sources/types';

function makeDraft(name: string, overrides: Partial<NormalizedDraft> = {}): CrossValidatedDraft {
  return {
    draft: {
      external_id: 'ext-1',
      name,
      address: '100 Main St',
      phone: null,
      cuisine_type: '餐饮',
      city: 'Houston',
      metro_area: 'houston',
      source: 'houston_hdhhs',
      license_date: '2026-04-01',
      first_inspection_date: null,
      license_type: null,
      source_raw: {},
      lead_status: 'new',
      ...overrides,
    },
    is_restaurant: true,
    confidence: 0.9,
    raw: null,
    source_count: 1,
    source_ids: ['houston_hdhhs'],
  };
}

// ─── SHOULD detect (top US chains) ──────────────────────────────────────────

const CHAIN_NAMES = [
  "McDonald's",
  "McDonald's #12345",
  'Starbucks Coffee',
  'Starbucks #4521',
  'Subway',
  'Subway Restaurant',
  'Chipotle Mexican Grill',
  'Chipotle Mexican Grill Inc',
  'Panera Bread',
  "Domino's Pizza",
  "Domino's",
  'Pizza Hut',
  'KFC',
  "Wendy's",
  'Taco Bell',
  "Burger King",
  "Chick-fil-A",
  "Chick-fil-A Restaurant",
  'Dunkin',
  'Dunkin Donuts',
  "Popeyes Louisiana Kitchen",
];

// ─── SHOULD NOT detect (indie restaurants) ───────────────────────────────────

const INDIE_NAMES = [
  'Golden Dragon Chinese Restaurant',
  'Little Tokyo Ramen',
  'Mission Taqueria',
  'Bay Area Burger Co',
  'Houston Eats',
  'The Noodle House',
  'Mama Rosa Pizzeria',
  'Uncle Chen Bistro',
  'Harbor View Seafood',
  'Sichuan Palace',
];

describe('chain detection — SHOULD flag as chain', () => {
  for (const name of CHAIN_NAMES) {
    it(`detects: "${name}"`, () => {
      const result = detectChain(makeDraft(name));
      expect(result.is_chain).toBe(true);
      expect(result.chain_name).not.toBeNull();
    });
  }
});

describe('chain detection — SHOULD NOT flag as chain (indie restaurants)', () => {
  for (const name of INDIE_NAMES) {
    it(`does not flag: "${name}"`, () => {
      const result = detectChain(makeDraft(name));
      expect(result.is_chain).toBe(false);
    });
  }
});

describe('chain detection — edge cases', () => {
  it('handles franchise number variant correctly', () => {
    const r = detectChain(makeDraft("McDonald's #99999"));
    expect(r.is_chain).toBe(true);
    expect(r.chain_name).toBe("McDonald's");
  });

  it('handles ALL CAPS name', () => {
    const r = detectChain(makeDraft('MCDONALDS'));
    expect(r.is_chain).toBe(true);
  });

  it('does not flag short name that happens to overlap (Bay)', () => {
    const r = detectChain(makeDraft('Bay'));
    expect(r.is_chain).toBe(false);
  });

  it('does not flag empty name', () => {
    const r = detectChain(makeDraft(''));
    expect(r.is_chain).toBe(false);
  });

  it('preserves all non-chain fields from input draft', () => {
    const input = makeDraft('Golden Dragon', { city: 'Boston' });
    const result = detectChain(input);
    expect(result.draft.city).toBe('Boston');
    expect(result.source_count).toBe(1);
    expect(result.source_ids).toEqual(['houston_hdhhs']);
  });
});
