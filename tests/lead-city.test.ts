import { describe, expect, it } from 'vitest';
import {
  collectCitiesFromLeadRows,
  extractCityFromAddress,
  resolveLeadCity,
} from '@/lib/lead-city';

describe('extractCityFromAddress', () => {
  it('matches known metro city in comma address', () => {
    expect(extractCityFromAddress('123 Main St, Oakland, CA 94612')).toBe('Oakland');
  });

  it('parses city before state+zip without known list match', () => {
    expect(
      extractCityFromAddress('500 Broadway, Somerville, MA 02145', ['Boston']),
    ).toBe('Somerville');
  });

  it('matches Manhattan in NYC-style address', () => {
    expect(extractCityFromAddress('100 Broadway, Manhattan, NY 10005')).toBe('Manhattan');
  });
});

describe('resolveLeadCity', () => {
  it('prefers explicit city column', () => {
    expect(resolveLeadCity('Berkeley', '1 Center St, Oakland, CA')).toBe('Berkeley');
  });

  it('falls back to address', () => {
    expect(resolveLeadCity(null, '200 University Ave, Palo Alto, CA 94301')).toBe('Palo Alto');
  });
});

describe('collectCitiesFromLeadRows', () => {
  it('merges column cities and address-derived cities', () => {
    const cities = collectCitiesFromLeadRows(
      [
        { city: 'San Francisco', address: null },
        { city: null, address: '1 Shattuck Sq, Berkeley, CA 94704' },
      ],
      'sf_bay',
    );
    expect(cities).toContain('San Francisco');
    expect(cities).toContain('Berkeley');
  });
});
