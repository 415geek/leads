import { describe, it, expect } from 'vitest';
import { _austinNormalizeRowForTests } from '@/lib/sources/austin';

describe('Austin Inspection Scores adapter', () => {
  it('uses facility_id when available', () => {
    const d = _austinNormalizeRowForTests({
      restaurant_name: 'Franklin BBQ',
      address: '900 E 11th St',
      facility_id: 'FAC-123',
      inspection_date: '2026-03-05',
    });
    expect(d!.external_id).toBe('FAC-123');
    expect(d!.name).toBe('Franklin BBQ');
    expect(d!.city).toBe('Austin');
    expect(d!.source).toBe('austin_inspect');
    expect(d!.metro_area).toBe('austin');
  });

  it('falls back to stable name+address hash when facility_id missing', () => {
    const d1 = _austinNormalizeRowForTests({
      restaurant_name: 'Uchi',
      address: '801 S Lamar Blvd',
      inspection_date: '2026-03-05',
    });
    const d2 = _austinNormalizeRowForTests({
      restaurant_name: 'Uchi',
      address: '801 S Lamar Blvd',
      inspection_date: '2026-03-15', // later date but same identity
    });
    expect(d1!.external_id).toBe(d2!.external_id);
    expect(d1!.external_id).toMatch(/^aus_/);
  });

  it('returns null when restaurant_name missing', () => {
    const d = _austinNormalizeRowForTests({ address: '1 Test' });
    expect(d).toBeNull();
  });
});
