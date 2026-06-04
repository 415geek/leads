import { describe, it, expect } from 'vitest';
import { entityNamesMatch, normalizeEntityName } from '@/lib/identity/normalize';

describe('normalizeEntityName', () => {
  it('treats LLC suffix variants as same entity', () => {
    expect(entityNamesMatch('Golden Dragon LLC', 'golden dragon, llc')).toBe(true);
    expect(normalizeEntityName('Golden Dragon LLC')).toBe('golden dragon');
  });
});
