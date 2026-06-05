import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  _resetCostGateStateForTests,
  getCostGateUsageSnapshot,
  getEnrichScoreThreshold,
  preEnrichScore,
  shouldCallPaidEnrich,
} from '@/lib/pipeline/cost-gate';
import {
  _resetEnrichStateForTests,
  createGooglePlacesEnricher,
  enrichDrafts,
} from '@/lib/pipeline/enrich';
import type { ClassifiedDraft } from '@/lib/pipeline/classify';
import type { NormalizedDraft } from '@/lib/sources/types';

function makeDraft(
  name: string,
  extra: Partial<NormalizedDraft> = {},
): ClassifiedDraft {
  return {
    draft: {
      external_id: `ext-${name}`,
      name,
      address: '123 Market St',
      phone: null,
      cuisine_type: '餐饮',
      city: 'San Francisco',
      metro_area: 'sf_bay',
      source: 'sf_gov',
      license_date: new Date().toISOString().split('T')[0],
      first_inspection_date: null,
      license_type: null,
      source_raw: {},
      lead_status: 'new',
      ...extra,
    },
    is_restaurant: true,
    confidence: 0.95,
    raw: null,
  };
}

describe('cost-gate threshold', () => {
  const prevFlag = process.env.ENABLE_LEAD_COST_GATE;
  const prevThreshold = process.env.ENRICH_SCORE_THRESHOLD;

  beforeEach(() => {
    _resetCostGateStateForTests();
    process.env.ENABLE_LEAD_COST_GATE = '1';
    process.env.ENRICH_SCORE_THRESHOLD = '80';
  });

  afterEach(() => {
    process.env.ENABLE_LEAD_COST_GATE = prevFlag;
    process.env.ENRICH_SCORE_THRESHOLD = prevThreshold;
  });

  it('defaults threshold to 55 when env unset', () => {
    delete process.env.ENRICH_SCORE_THRESHOLD;
    expect(getEnrichScoreThreshold()).toBe(55);
  });

  it('low pre-score blocks paid enrich', () => {
    const weak = makeDraft('Weak Cafe', {
      license_date: '2010-01-01',
      metro_area: 'unknown',
    });
    const gate = shouldCallPaidEnrich({
      draft: weak.draft,
      confidence: 0.2,
      source_count: 1,
      is_chain: true,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.preScore).toBeLessThan(80);
    expect(getCostGateUsageSnapshot().skippedBelowThreshold).toBe(1);
  });

  it('score at threshold boundary allows enrich', () => {
    const input = {
      draft: makeDraft('Strong New', {
        license_date: new Date().toISOString().split('T')[0],
        opening_signals: { new_opening_label: 'confirmed_new_opening' },
      }).draft,
      confidence: 0.95,
      source_count: 3,
      is_chain: false,
    };
    const score = preEnrichScore(input);
    process.env.ENRICH_SCORE_THRESHOLD = String(score);
    const gate = shouldCallPaidEnrich(input);
    expect(gate.allowed).toBe(true);
  });
});

describe('enrichDrafts with ENABLE_LEAD_COST_GATE', () => {
  const prevFlag = process.env.ENABLE_LEAD_COST_GATE;
  const prevThreshold = process.env.ENRICH_SCORE_THRESHOLD;

  beforeEach(() => {
    _resetEnrichStateForTests();
    process.env.ENABLE_LEAD_COST_GATE = '1';
    process.env.ENRICH_SCORE_THRESHOLD = '999';
  });

  afterEach(() => {
    process.env.ENABLE_LEAD_COST_GATE = prevFlag;
    process.env.ENRICH_SCORE_THRESHOLD = prevThreshold;
  });

  it('low-score lead does not trigger Google Places fetch', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      async json() {
        return { status: 'OK', results: [{ place_id: 'P1' }] };
      },
    }));
    const client = createGooglePlacesEnricher({
      apiKey: 'test-key',
      dailyCap: 100,
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    const weak = {
      ...makeDraft('Stale Spot', { license_date: '2000-01-01' }),
      source_count: 1,
      is_chain: true,
    };
    const strong = {
      ...makeDraft('Hot Opening', {
        license_date: new Date().toISOString().split('T')[0],
        opening_signals: { new_opening_label: 'confirmed_new_opening' },
      }),
      source_count: 3,
      is_chain: false,
      confidence: 0.99,
    };

    process.env.ENRICH_SCORE_THRESHOLD = '70';
    const out = await enrichDrafts([weak, strong], { client });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(out[0].enrichment).toBeNull();
    expect(out[1].enrichment?.google_place_id).toBe('P1');
  });

  it('paid cache prevents second Google call for same name+address', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      async json() {
        return { status: 'OK', results: [{ place_id: 'P1' }] };
      },
    }));
    const client = createGooglePlacesEnricher({
      apiKey: 'test-key',
      dailyCap: 100,
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    process.env.ENRICH_SCORE_THRESHOLD = '0';
    const base = {
      ...makeDraft('Same Place', { external_id: 'a' }),
      source_count: 2,
      is_chain: false,
    };
    const sameAddressDifferentSource = {
      ...makeDraft('Same Place', { external_id: 'b', source: 'la_gov' }),
      source_count: 2,
      is_chain: false,
    };

    await enrichDrafts([base], { client });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const second = await enrichDrafts([sameAddressDifferentSource], { client });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(second[0].enrichment).toBeNull();
    expect(getCostGateUsageSnapshot().skippedCacheHit).toBeGreaterThanOrEqual(1);
  });
});

describe('flag off preserves enrich behavior', () => {
  const prevFlag = process.env.ENABLE_LEAD_COST_GATE;

  beforeEach(() => {
    _resetEnrichStateForTests();
    delete process.env.ENABLE_LEAD_COST_GATE;
    process.env.ENRICH_SCORE_THRESHOLD = '999';
  });

  afterEach(() => {
    process.env.ENABLE_LEAD_COST_GATE = prevFlag;
    delete process.env.ENRICH_SCORE_THRESHOLD;
  });

  it('does not skip low-score leads when cost gate disabled', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      async json() {
        return { status: 'OK', results: [{ place_id: 'P1' }] };
      },
    }));
    const client = createGooglePlacesEnricher({
      apiKey: 'test-key',
      dailyCap: 100,
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    const weak = {
      ...makeDraft('Old Spot', { license_date: '1999-01-01' }),
      source_count: 1,
      is_chain: true,
    };
    await enrichDrafts([weak], { client });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
