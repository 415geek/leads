import { describe, it, expect, vi } from 'vitest';
import { skipTraceToEvidenceRows } from '@/lib/enrichment/skip-trace-to-evidence';

describe('skipTraceToEvidenceRows', () => {
  it('maps phones with mobile metadata for P3 scoring', () => {
    const rows = skipTraceToEvidenceRows('lead-1', {
      phones: [{ value: '5551234567', type: 'mobile', confidenceRaw: 0.9, isMobile: true }],
      emails: [],
      rawPayload: null,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.field).toBe('phone');
    expect(rows[0]?.raw_payload).toMatchObject({ isMobile: true });
  });
});

describe('skipTraceEnrichLeadById', () => {
  it('returns 404-shaped error when lead missing', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
    };

    const { skipTraceEnrichLeadById } = await import('@/lib/enrichment/enrich-lead');
    await expect(
      skipTraceEnrichLeadById(supabase as never, '00000000-0000-0000-0000-000000000099'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
