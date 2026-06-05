import { describe, it, expect, vi } from 'vitest';
import {
  mergeEnrichment,
  pickEnrichmentMergeFields,
} from '@/lib/pipeline/merge-enrichment';

describe('mergeEnrichment', () => {
  it('strips blocked fields like lead_status and notes', () => {
    const picked = pickEnrichmentMergeFields({
      owner_person_name: 'Jane Doe',
      lead_status: 'contacted',
      notes: 'manual note',
      phone: '555-0100',
    });
    expect(picked).toEqual({
      owner_person_name: 'Jane Doe',
      phone: '555-0100',
    });
  });

  it('updates whitelisted fields on existing lead', async () => {
    let updatePayload: Record<string, unknown> | null = null;
    const eqUpdate = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn((payload: Record<string, unknown>) => {
      updatePayload = payload;
      return { eq: eqUpdate };
    });
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'lead-1' }, error: null }),
          }),
        }),
        update,
      })),
    };

    const result = await mergeEnrichment(supabase as never, 'lead-1', {
      owner_person_name: 'Jane Doe',
      lead_status: 'won',
    });

    expect(result.updated).toBe(true);
    expect(updatePayload).toEqual({ owner_person_name: 'Jane Doe' });
    expect(eqUpdate).toHaveBeenCalledWith('id', 'lead-1');
  });

  it('does not error when lead id is missing', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
        update: vi.fn(),
      })),
    };

    const result = await mergeEnrichment(supabase as never, 'missing', {
      phone: '555-0199',
    });
    expect(result.updated).toBe(false);
    expect(result.skipped).toBe(true);
  });
});
