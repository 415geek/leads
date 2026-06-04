import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('POST /api/leads/enrich feature flag', () => {
  const prev = process.env.ENABLE_LEAD_SKIP_TRACE_ENRICH;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.ENABLE_LEAD_SKIP_TRACE_ENRICH;
  });

  afterEach(() => {
    process.env.ENABLE_LEAD_SKIP_TRACE_ENRICH = prev;
  });

  it('returns 503 when feature flag off', async () => {
    const { POST } = await import('@/app/api/leads/enrich/route');
    const res = await POST(
      new Request('http://localhost/api/leads/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: '00000000-0000-0000-0000-000000000001' }),
      }),
    );
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toMatch(/未启用/);
  });
});
