import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('POST /api/leads/cross-validate feature flag', () => {
  const prev = process.env.ENABLE_LEAD_EVIDENCE_CROSS_VALIDATE;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.ENABLE_LEAD_EVIDENCE_CROSS_VALIDATE;
  });

  afterEach(() => {
    process.env.ENABLE_LEAD_EVIDENCE_CROSS_VALIDATE = prev;
  });

  it('returns 503 when feature flag off', async () => {
    const { POST } = await import('@/app/api/leads/cross-validate/route');
    const res = await POST(
      new Request('http://localhost/api/leads/cross-validate', {
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
