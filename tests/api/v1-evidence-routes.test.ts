import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { v1CrossValidateLead } from '@/lib/api-v1/evidence-routes';

describe('v1 evidence routes feature flags', () => {
  const prev = process.env.ENABLE_LEAD_EVIDENCE_CROSS_VALIDATE;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.ENABLE_LEAD_EVIDENCE_CROSS_VALIDATE;
  });

  afterEach(() => {
    process.env.ENABLE_LEAD_EVIDENCE_CROSS_VALIDATE = prev;
  });

  it('v1CrossValidateLead returns 503 when disabled', async () => {
    const res = await v1CrossValidateLead({} as never, 'lead-id');
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.api_version).toBe('v1');
    expect(json.error).toMatch(/未启用/);
  });
});
