import { describe, it, expect } from 'vitest';
import {
  isHoustonMetroCity,
  pickStr,
  rowToHoustonRestaurantDraft,
  toIsoDate,
} from '@/lib/sources/houston/json-supplement';

describe('houston json-supplement', () => {
  it('toIsoDate parses US and ISO dates', () => {
    expect(toIsoDate('2026-03-01')).toBe('2026-03-01');
    expect(toIsoDate('3/1/2026')).toBe('2026-03-01');
  });

  it('isHoustonMetroCity accepts Harris county', () => {
    expect(isHoustonMetroCity('Tomball', 'Harris')).toBe(true);
    expect(isHoustonMetroCity('Dallas', 'Dallas')).toBe(false);
  });

  it('rowToHoustonRestaurantDraft filters non-restaurant names', () => {
    const draft = rowToHoustonRestaurantDraft({
      sourceId: 'test',
      row: { name: 'Acme Logistics LLC', address: '1 Main', filed_date: '2026-04-01' },
      since: '2026-01-01',
      nameKeys: ['name'],
      dateKeys: ['filed_date'],
      idPrefix: 't',
      cuisineLabel: 'Test',
      licenseType: 'Test',
      houston_opening: {
        display_status: 'pre-opening',
        display_source: 'Test',
        confidence_score: 'LOW',
      },
    });
    expect(draft).toBeNull();
  });

  it('rowToHoustonRestaurantDraft accepts restaurant keyword', () => {
    const draft = rowToHoustonRestaurantDraft({
      sourceId: 'houston_health_food_permit',
      row: {
        business_name: 'Dragon Noodle Kitchen',
        address: '100 Main St',
        city: 'Houston',
        issue_date: '2026-04-01',
        permit_number: 'PE-99',
      },
      since: '2026-01-01',
      nameKeys: ['business_name'],
      addressKeys: ['address'],
      dateKeys: ['issue_date'],
      idKeys: ['permit_number'],
      idPrefix: 'hfd',
      cuisineLabel: 'Food Permit',
      licenseType: 'Food',
      houston_opening: {
        display_status: 'opening soon',
        display_source: 'Food Permit',
        confidence_score: 'HIGH',
      },
    });
    expect(draft).not.toBeNull();
    expect(draft!.name).toBe('Dragon Noodle Kitchen');
    expect(pickStr({ business_name: 'x' }, ['business_name'])).toBe('x');
  });

  it('rowToHoustonRestaurantDraft renames permit work project_name to address label', () => {
    const draft = rowToHoustonRestaurantDraft({
      sourceId: 'houston_permit_portal',
      row: {
        project_name: 'RESTAURANT REMODEL 1-1-2-A2-B',
        comments: 'RESTAURANT REMODEL 1-1-2-A2-B',
        address: '7675 CLAREWOOD DR',
        city: 'Houston',
        permit_date: '2026-04-01',
        permit_number: '250001',
      },
      since: '2026-01-01',
      nameKeys: ['project_name', 'business_name'],
      addressKeys: ['address'],
      dateKeys: ['permit_date'],
      idKeys: ['permit_number'],
      idPrefix: 'hpc',
      cuisineLabel: 'Houston Permit',
      licenseType: 'Building Permit',
      requireRestaurantKeyword: false,
      houston_opening: {
        display_status: 'pre-opening',
        display_source: 'Building Permit',
        confidence_score: 'MEDIUM',
      },
    });
    expect(draft).not.toBeNull();
    expect(draft!.name).toBe('New food service · 7675 CLAREWOOD DR');
  });
});
