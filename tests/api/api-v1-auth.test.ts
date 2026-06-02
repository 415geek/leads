import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  extractApiKeyFromHeaders,
  isApiV1Configured,
  requireApiV1Auth,
  verifyApiV1Key,
} from '@/lib/api-auth';

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe('api-v1 auth', () => {
  const origSingle = process.env.API_V1_KEY;
  const origMulti = process.env.API_V1_KEYS;

  beforeEach(() => {
    delete process.env.API_V1_KEY;
    delete process.env.API_V1_KEYS;
  });

  afterEach(() => {
    if (origSingle) process.env.API_V1_KEY = origSingle;
    else delete process.env.API_V1_KEY;
    if (origMulti) process.env.API_V1_KEYS = origMulti;
    else delete process.env.API_V1_KEYS;
  });

  it('is not configured without env', () => {
    expect(isApiV1Configured()).toBe(false);
  });

  it('extracts Bearer token', () => {
    const h = headers({ Authorization: 'Bearer secret-key-123' });
    expect(extractApiKeyFromHeaders(h)).toBe('secret-key-123');
  });

  it('extracts X-API-Key', () => {
    const h = headers({ 'X-API-Key': 'my-key' });
    expect(extractApiKeyFromHeaders(h)).toBe('my-key');
  });

  it('verifies API_V1_KEY', () => {
    process.env.API_V1_KEY = 'test-key-abc';
    expect(isApiV1Configured()).toBe(true);
    expect(verifyApiV1Key('test-key-abc')?.scopes).toContain('read');
    expect(verifyApiV1Key('wrong')).toBeNull();
  });

  it('requireApiV1Auth returns 401 for bad key', () => {
    process.env.API_V1_KEY = 'good';
    const r = requireApiV1Auth(headers({ Authorization: 'Bearer bad' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it('requireApiV1Auth succeeds with valid key', () => {
    process.env.API_V1_KEY = 'good';
    const r = requireApiV1Auth(headers({ Authorization: 'Bearer good' }), 'read');
    expect(r.ok).toBe(true);
  });
});
