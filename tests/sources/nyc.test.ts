import { describe, it, expect, vi } from 'vitest';
import { nycSource, _nycNormalizeRowForTests } from '@/lib/sources/nyc';

describe('NYC DOHMH adapter', () => {
  describe('normalizeRow', () => {
    it('extracts camis as external_id, maps boro to city', () => {
      const row = {
        camis: '40356018',
        dba: 'JOE\'S PIZZA',
        boro: 'MANHATTAN',
        building: '7',
        street: 'CARMINE ST',
        zipcode: '10014',
        phone: '2126661233',
        cuisine_description: 'Pizza',
        inspection_date: '2026-03-15T00:00:00.000',
      };
      const d = _nycNormalizeRowForTests(row);
      expect(d).not.toBeNull();
      expect(d!.external_id).toBe('40356018');
      expect(d!.name).toBe('JOE\'S PIZZA');
      expect(d!.city).toBe('Manhattan');
      expect(d!.metro_area).toBe('nyc');
      expect(d!.source).toBe('nyc_dohmh');
      expect(d!.license_date).toBe('2026-03-15');
      expect(d!.first_inspection_date).toBe('2026-03-15');
      expect(d!.address).toContain('7 CARMINE ST');
      expect(d!.phone).toBe('2126661233');
    });

    it('tags Chinese cuisine when cuisine_description is Chinese', () => {
      const d = _nycNormalizeRowForTests({
        camis: '12345',
        dba: 'Golden Dragon',
        boro: 'QUEENS',
        cuisine_description: 'Chinese',
        inspection_date: '2026-03-10',
      });
      expect(d!.cuisine_type).toBe('中餐');
    });

    it('returns null when dba is missing', () => {
      const d = _nycNormalizeRowForTests({ camis: '1', boro: 'BROOKLYN' });
      expect(d).toBeNull();
    });

    it('handles each borough correctly', () => {
      const boros = [
        ['MANHATTAN', 'Manhattan'],
        ['BROOKLYN', 'Brooklyn'],
        ['QUEENS', 'Queens'],
        ['BRONX', 'Bronx'],
        ['STATEN ISLAND', 'Staten Island'],
      ];
      for (const [boro, city] of boros) {
        const d = _nycNormalizeRowForTests({
          camis: '1',
          dba: 'Test Cafe',
          boro,
          cuisine_description: 'Pizza',
        });
        expect(d!.city).toBe(city);
      }
    });

    it('falls back to "New York" for unknown boro', () => {
      const d = _nycNormalizeRowForTests({
        camis: '1',
        dba: 'Test Cafe',
        boro: 'MARS',
        cuisine_description: 'Pizza',
      });
      expect(d!.city).toBe('New York');
    });
  });

  describe('fetchAndNormalize integration', () => {
    it('uses Socrata inspection_date filter and returns drafts', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        async json() {
          return [
            {
              camis: '1',
              dba: 'Alpha Pizza',
              boro: 'MANHATTAN',
              cuisine_description: 'Italian',
              inspection_date: '2026-03-01',
            },
            {
              camis: '2',
              dba: 'Beta Dumpling',
              boro: 'BROOKLYN',
              cuisine_description: 'Chinese',
              inspection_date: '2026-03-02',
            },
          ];
        },
      } as Response);

      const { result, drafts } = await nycSource.fetchAndNormalize({
        sinceDate: '2026-02-01',
      });

      expect(result.ok).toBe(true);
      expect(result.fetched).toBe(2);
      expect(drafts).toHaveLength(2);
      expect(drafts[1].cuisine_type).toBe('中餐');

      const calledUrl = String(fetchSpy.mock.calls[0][0]);
      expect(calledUrl).toContain('43nn-pn8j.json');
      expect(calledUrl).toContain('inspection_date');
      expect(calledUrl).toContain('2026-02-01');

      fetchSpy.mockRestore();
    });

    it('HTTP error returns ok=false with error message', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 503,
        async json() {
          return [];
        },
      } as Response);

      const { result, drafts } = await nycSource.fetchAndNormalize({
        sinceDate: '2026-02-01',
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('503');
      expect(drafts).toEqual([]);

      fetchSpy.mockRestore();
    });
  });
});
