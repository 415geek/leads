import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BatchDataProvider, MockSkipTraceProvider, parseBatchDataResponse } from '@/lib/enrichment/batchdata';
import { fetchJsonWithTimeout } from '@/lib/enrichment/http';
import { getSkipTraceProvider } from '@/lib/enrichment/provider';
import { skipTraceToEvidenceRows } from '@/lib/enrichment/skip-trace-to-evidence';
import { SkipTraceError } from '@/lib/enrichment/types';

describe('parseBatchDataResponse', () => {
  it('maps hit with phones and emails', () => {
    const r = parseBatchDataResponse({
      person: {
        phones: [{ number: '4155550100', type: 'mobile', confidence: 0.9 }],
        emails: [{ address: 'a@b.com', confidence: 80 }],
      },
    });
    expect(r.phones).toHaveLength(1);
    expect(r.phones[0].type).toBe('mobile');
    expect(r.emails[0].value).toBe('a@b.com');
  });

  it('returns empty when no person', () => {
    const r = parseBatchDataResponse({ results: { persons: [] } });
    expect(r.phones).toHaveLength(0);
    expect(r.emails).toHaveLength(0);
  });
});

describe('BatchDataProvider', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('returns candidates on success', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          person: {
            phones: [{ number: '5551234567', type: 'Mobile', confidence: 0.88 }],
            emails: [{ address: 'owner@test.com', confidence: 0.75 }],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const provider = new BatchDataProvider({
      apiKey: 'test-key',
      baseUrl: 'https://api.example.com',
      fetchImpl: fetchMock,
    });

    const result = await provider.skipTrace({
      personName: 'Jane Doe',
      address: '123 Main St, San Francisco, CA 94103',
    });

    expect(result.phones[0].value).toBe('5551234567');
    expect(result.phones[0].isMobile).toBe(true);
    expect(result.emails[0].value).toBe('owner@test.com');
  });

  it('throws on timeout', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'TimeoutError' }));

    const provider = new BatchDataProvider({
      apiKey: 'test-key',
      fetchImpl: fetchMock,
    });

    await expect(
      provider.skipTrace({ personName: 'Jane', address: '123 Main St, SF CA' }),
    ).rejects.toMatchObject({ code: 'timeout' });
  });

  it('throws on 429', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 429 }));

    const provider = new BatchDataProvider({
      apiKey: 'test-key',
      fetchImpl: fetchMock,
    });

    await expect(
      provider.skipTrace({ personName: 'Jane', address: '123 Main St, SF CA' }),
    ).rejects.toMatchObject({ code: 'rate_limit' });
  });

  it('throws on malformed JSON', async () => {
    fetchMock.mockResolvedValue(new Response('not-json', { status: 200 }));

    const provider = new BatchDataProvider({
      apiKey: 'test-key',
      fetchImpl: fetchMock,
    });

    await expect(
      provider.skipTrace({ personName: 'Jane', address: '123 Main St, SF CA' }),
    ).rejects.toMatchObject({ code: 'parse' });
  });
});

describe('MockSkipTraceProvider', () => {
  it('returns fixture without network', async () => {
    const p = new MockSkipTraceProvider({
      phones: [],
      emails: [{ value: 'x@y.com', confidenceRaw: 1 }],
      rawPayload: null,
    });
    const r = await p.skipTrace({ personName: 'A', address: 'B' });
    expect(r.emails[0].value).toBe('x@y.com');
  });
});

describe('skipTraceToEvidenceRows', () => {
  it('builds phone and email evidence inserts', () => {
    const rows = skipTraceToEvidenceRows('lead-uuid', {
      phones: [{ value: '555', type: 'mobile', confidenceRaw: 0.5, isMobile: true }],
      emails: [{ value: 'a@b.co', confidenceRaw: 0.6 }],
      rawPayload: null,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].field).toBe('phone');
    expect(rows[1].field).toBe('email');
  });
});

describe('getSkipTraceProvider', () => {
  const prev = process.env.SKIP_TRACE_PROVIDER;
  const prevKey = process.env.BATCHDATA_API_KEY;

  afterEach(() => {
    process.env.SKIP_TRACE_PROVIDER = prev;
    process.env.BATCHDATA_API_KEY = prevKey;
  });

  it('uses mock when SKIP_TRACE_PROVIDER=mock', () => {
    process.env.SKIP_TRACE_PROVIDER = 'mock';
    const p = getSkipTraceProvider();
    expect(p.id).toBe('mock');
  });

  it('throws config error when batchdata selected but no key', () => {
    process.env.SKIP_TRACE_PROVIDER = 'batchdata';
    delete process.env.BATCHDATA_API_KEY;
    expect(() => getSkipTraceProvider()).toThrow(SkipTraceError);
  });
});

describe('fetchJsonWithTimeout', () => {
  it('maps auth errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    await expect(
      fetchJsonWithTimeout('https://x', { method: 'GET' }, fetchMock),
    ).rejects.toMatchObject({ code: 'auth' });
  });
});
