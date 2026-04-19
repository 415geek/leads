import { describe, it, expect, vi } from 'vitest';
import { chicagoSource, _chicagoNormalizeRowForTests } from '@/lib/sources/chicago';

describe('Chicago Food Inspections adapter', () => {
  it('normalizes with license_ as external_id', () => {
    const row = {
      dba_name: 'DEEP DISH KITCHEN',
      aka_name: 'DDK',
      license_: '12345',
      facility_type: 'Restaurant',
      address: '123 W MADISON ST',
      city: 'CHICAGO',
      inspection_date: '2026-03-10T00:00:00.000',
    };
    const d = _chicagoNormalizeRowForTests(row);
    expect(d).not.toBeNull();
    expect(d!.external_id).toBe('12345');
    expect(d!.name).toBe('DEEP DISH KITCHEN');
    expect(d!.metro_area).toBe('chicago');
    expect(d!.source).toBe('chicago_food_inspect');
    expect(d!.license_date).toBe('2026-03-10');
    expect(d!.city).toBe('CHICAGO');
  });

  it('falls back to aka_name when dba_name is missing', () => {
    const d = _chicagoNormalizeRowForTests({
      aka_name: 'Alt Name',
      facility_type: 'Restaurant',
      inspection_date: '2026-03-01',
    });
    expect(d!.name).toBe('Alt Name');
  });

  it('returns null when both dba_name and aka_name are missing', () => {
    const d = _chicagoNormalizeRowForTests({ facility_type: 'Restaurant' });
    expect(d).toBeNull();
  });

  it('fetchAndNormalize applies restaurant-only filter and date', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      async json() {
        return [
          {
            dba_name: 'X',
            facility_type: 'Restaurant',
            address: '1 Main',
            inspection_date: '2026-03-01',
          },
        ];
      },
    } as Response);

    await chicagoSource.fetchAndNormalize({ sinceDate: '2026-02-01' });

    const calledUrl = String(fetchSpy.mock.calls[0][0]);
    expect(calledUrl).toContain('4ijn-s7e5.json');
    expect(calledUrl).toContain('facility_type');
    expect(decodeURIComponent(calledUrl)).toContain("facility_type='Restaurant'");

    fetchSpy.mockRestore();
  });
});
