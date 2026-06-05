import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WhitepagesSkipTraceProvider,
  whitepagesRecordToSkipTrace,
} from '@/lib/enrichment/whitepages';
import { getSkipTraceProvider, skipTraceEvidenceSource } from '@/lib/enrichment/provider';
import { SkipTraceError } from '@/lib/enrichment/types';

describe('whitepagesRecordToSkipTrace', () => {
  it('maps phones and emails from Whitepages record', () => {
    const result = whitepagesRecordToSkipTrace({
      id: 'wp-1',
      match_score: 88,
      phones: [{ number: '4155550100', type: 'Mobile', score: 90 }],
      emails: ['owner@example.com'],
    });
    expect(result.phones[0]?.value).toBe('4155550100');
    expect(result.phones[0]?.isMobile).toBe(true);
    expect(result.emails[0]?.value).toBe('owner@example.com');
  });
});

describe('WhitepagesSkipTraceProvider', () => {
  const prevKey = process.env.WHITEPAGES_PRO_API_KEY;

  beforeEach(() => {
    process.env.WHITEPAGES_PRO_API_KEY = 'test-wp-key';
  });

  afterEach(() => {
    process.env.WHITEPAGES_PRO_API_KEY = prevKey;
  });

  it('throws config when API key missing', () => {
    delete process.env.WHITEPAGES_PRO_API_KEY;
    expect(() => new WhitepagesSkipTraceProvider()).toThrow(SkipTraceError);
  });

  it('returns skip-trace result from mocked search', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              id: 'r1',
              match_score: 92,
              phones: [{ number: '5551234567', type: 'mobile', score: 85 }],
              emails: ['jane@restaurant.com'],
            },
          ],
          metadata: { result_count: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const provider = new WhitepagesSkipTraceProvider({
      apiKey: 'k',
      fetchImpl: fetchImpl as typeof fetch,
    });
    const result = await provider.skipTrace({
      personName: 'Jane Doe',
      address: '123 Main St, San Francisco, CA 94103',
    });
    expect(result.phones[0]?.value).toBe('5551234567');
    expect(result.emails[0]?.value).toBe('jane@restaurant.com');
  });
});

describe('getSkipTraceProvider whitepages', () => {
  const prev = process.env.SKIP_TRACE_PROVIDER;
  const prevKey = process.env.WHITEPAGES_PRO_API_KEY;

  afterEach(() => {
    process.env.SKIP_TRACE_PROVIDER = prev;
    process.env.WHITEPAGES_PRO_API_KEY = prevKey;
  });

  it('uses whitepages when configured', () => {
    process.env.SKIP_TRACE_PROVIDER = 'whitepages';
    process.env.WHITEPAGES_PRO_API_KEY = 'k';
    expect(getSkipTraceProvider().id).toBe('whitepages');
    expect(skipTraceEvidenceSource('whitepages')).toBe('whitepages');
  });
});
