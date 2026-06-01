import { describe, it, expect } from 'vitest';
import {
  buildOwnerSearchDefaultsFromLead,
  parseStateFromAddress,
} from '@/lib/lead-owner-search-defaults';

describe('lead-owner-search-defaults', () => {
  it('prefills from lead fields and source_raw owner_name', () => {
    const v = buildOwnerSearchDefaultsFromLead({
      name: 'Lu\'s Kitchen',
      address: '2406 19th Ave, San Francisco, CA 94116',
      city: 'San Francisco',
      source_raw: { owner_name: 'Tony Lu', dba: 'Lu\'s Kitchen' },
    });
    expect(v.name).toBe('Tony Lu');
    expect(v.region).toBe('San Francisco, CA');
    expect(v.address).toContain('19th Ave');
    expect(v.keywords).toBe('Lu\'s Kitchen');
  });

  it('uses city alone when address has no state suffix', () => {
    const v = buildOwnerSearchDefaultsFromLead({
      name: 'Test Cafe',
      address: '123 Main St',
      city: 'Duarte',
      source_raw: null,
    });
    expect(v.name).toBe('');
    expect(v.region).toBe('Duarte');
    expect(v.keywords).toBe('Test Cafe');
  });

  it('parseStateFromAddress extracts US state', () => {
    expect(parseStateFromAddress('2229 HUNTINGTON DR, DUARTE, CA 91010')).toBe('CA');
  });
});
