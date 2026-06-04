import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('POST /api/property/lookup feature flag', () => {
  const prev = process.env.ENABLE_LEAD_PROPERTY_LOOKUP;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.ENABLE_LEAD_PROPERTY_LOOKUP;
  });

  afterEach(() => {
    process.env.ENABLE_LEAD_PROPERTY_LOOKUP = prev;
  });

  it('returns 503 when feature flag off', async () => {
    const { POST } = await import('@/app/api/property/lookup/route');
    const res = await POST(
      new Request('http://localhost/api/property/lookup', {
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
