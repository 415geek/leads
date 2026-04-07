import { describe, expect, it } from 'vitest';
import {
  buildBerkeleyFoodWhereClause,
  buildCuisineLabel,
  buildSfFoodServiceWhereClause,
} from '@/lib/bay-area-food-import/shared';

describe('bay-area-food-import shared', () => {
  it('SF where clause pins city and date', () => {
    const w = buildSfFoodServiceWhereClause('2025-01-01');
    expect(w).toContain("city = 'San Francisco'");
    expect(w).toContain("location_start_date >= '2025-01-01'");
    expect(w).toContain('722%');
  });

  it('Berkeley where clause requires Berkeley situs and food signals', () => {
    const w = buildBerkeleyFoodWhereClause();
    expect(w).toContain('BERKELEY');
    expect(w).toContain("starts_with(naics, '722')");
    expect(w).toContain('RESTAURANT');
  });

  it('buildCuisineLabel tags Chinese from name (Sichuan in business name → 川菜)', () => {
    expect(
      buildCuisineLabel({
        naicsLine: '722110',
        licLine: 'SICHUAN RESTAURANT',
        businessName: 'Garden',
        dba: 'Garden',
      }),
    ).toBe('川菜');
  });
});
