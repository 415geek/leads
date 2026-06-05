import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildOutcomeInsert,
  recordLeadOutcomeOnStatusChange,
} from '@/lib/feedback/record-outcome';
import type { Lead } from '@/types/lead';

function leadFixture(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    name: 'Test Cafe',
    address: '1 Main',
    phone: null,
    cuisine_type: '餐饮',
    city: 'SF',
    metro_area: 'sf_bay',
    source: 'sf_gov',
    license_date: null,
    license_type: null,
    lead_score: 78,
    lead_status: 'in_progress',
    outreach_message: null,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    new_store_confidence: 85,
    store_status: 'new',
    owner_person_name: 'Jane Doe',
    source_count: 2,
    is_chain: false,
    ai_classification: { nyc_opening: { display_status: 'pre-permit' } },
    ...overrides,
  };
}

describe('buildOutcomeInsert', () => {
  it('maps converted to won outcome', () => {
    const row = buildOutcomeInsert(leadFixture(), 'in_progress', 'converted');
    expect(row?.outcome).toBe('won');
    expect(row?.lead_score).toBe(78);
    expect(row?.opening_snapshot).toMatchObject({ nyc_opening: { display_status: 'pre-permit' } });
  });

  it('maps not_interested to lost', () => {
    const row = buildOutcomeInsert(leadFixture(), 'contacted', 'not_interested');
    expect(row?.outcome).toBe('lost');
  });

  it('skips non-terminal status changes', () => {
    expect(buildOutcomeInsert(leadFixture(), 'new', 'contacted')).toBeNull();
  });

  it('skips repeat converted without transition', () => {
    expect(buildOutcomeInsert(leadFixture({ lead_status: 'converted' }), 'converted', 'converted')).toBeNull();
  });
});

describe('recordLeadOutcomeOnStatusChange', () => {
  const prev = process.env.ENABLE_LEAD_FEEDBACK;

  beforeEach(() => {
    process.env.ENABLE_LEAD_FEEDBACK = '1';
  });

  afterEach(() => {
    process.env.ENABLE_LEAD_FEEDBACK = prev;
  });

  it('no-ops when flag disabled', async () => {
    delete process.env.ENABLE_LEAD_FEEDBACK;
    const insert = vi.fn();
    const res = await recordLeadOutcomeOnStatusChange(
      { from: () => ({ insert }) } as never,
      leadFixture(),
      'new',
      'converted',
    );
    expect(res.recorded).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('inserts outcome when flag on', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn().mockReturnValue({ insert }) };
    const res = await recordLeadOutcomeOnStatusChange(
      supabase as never,
      leadFixture(),
      'in_progress',
      'converted',
    );
    expect(res.recorded).toBe(true);
    expect(res.outcome).toBe('won');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ lead_id: 'lead-1', outcome: 'won', new_status: 'converted' }),
    );
  });

  it('degrades when table missing', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { code: '42P01', message: 'relation missing' } });
    const supabase = { from: vi.fn().mockReturnValue({ insert }) };
    const res = await recordLeadOutcomeOnStatusChange(
      supabase as never,
      leadFixture(),
      'contacted',
      'not_interested',
    );
    expect(res.recorded).toBe(false);
    expect(res.schemaReady).toBe(false);
  });
});
