import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { v1CrossValidateLead, v1PersistOwnerSearchLead } from '@/lib/api-v1/evidence-routes';

describe('v1 evidence routes feature flags', () => {
  const prevCross = process.env.ENABLE_LEAD_EVIDENCE_CROSS_VALIDATE;
  const prevWrite = process.env.ENABLE_LEAD_EVIDENCE_WRITE;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.ENABLE_LEAD_EVIDENCE_CROSS_VALIDATE;
    delete process.env.ENABLE_LEAD_EVIDENCE_WRITE;
  });

  afterEach(() => {
    process.env.ENABLE_LEAD_EVIDENCE_CROSS_VALIDATE = prevCross;
    process.env.ENABLE_LEAD_EVIDENCE_WRITE = prevWrite;
  });

  it('v1CrossValidateLead returns 503 when disabled', async () => {
    const res = await v1CrossValidateLead({} as never, 'lead-id');
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.api_version).toBe('v1');
    expect(json.error).toMatch(/未启用/);
  });

  it('v1PersistOwnerSearchLead returns 503 when write disabled', async () => {
    const res = await v1PersistOwnerSearchLead({} as never, 'lead-id', { results: [] });
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.api_version).toBe('v1');
    expect(json.error).toMatch(/未启用/);
  });
});
