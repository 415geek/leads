import { describe, it, expect } from 'vitest';
import { parseListLeadsFromSearchParams } from '@/lib/leads/query-leads';

describe('parseListLeadsFromSearchParams', () => {
  it('parses filters like the web UI', () => {
    const sp = new URLSearchParams({
      page: '2',
      limit: '50',
      region: 'houston',
      city: 'Houston',
      hide_chains: '1',
      chinese_only: 'true',
      min_score: '70',
      search: 'taco',
      date_from: '2025-01-01',
      sort: 'license_date',
      order: 'asc',
    });

    const p = parseListLeadsFromSearchParams(sp);
    expect(p.page).toBe(2);
    expect(p.limit).toBe(50);
    expect(p.region).toBe('houston');
    expect(p.city).toBe('Houston');
    expect(p.hide_chains).toBe(true);
    expect(p.chinese_only).toBe(true);
    expect(p.min_score).toBe(70);
    expect(p.search).toBe('taco');
    expect(p.date_from).toBe('2025-01-01');
    expect(p.sort).toBe('license_date');
    expect(p.order).toBe('asc');
  });
});
