import { describe, expect, it } from 'vitest';
import {
  buildWhitepagesQueryParams,
  parseRegionInput,
  searchWhitepagesOwners,
} from '@/lib/whitepages/owner-search';

describe('parseRegionInput', () => {
  it('解析 City, ST', () => {
    expect(parseRegionInput('San Francisco, CA')).toEqual({
      city: 'San Francisco',
      state_code: 'CA',
    });
  });

  it('解析州全名', () => {
    expect(parseRegionInput('California')).toEqual({ state_code: 'CA' });
  });

  it('解析两字母州', () => {
    expect(parseRegionInput('TX')).toEqual({ state_code: 'TX' });
  });

  it('其余当作城市', () => {
    expect(parseRegionInput('Austin')).toEqual({ city: 'Austin' });
  });
});

describe('buildWhitepagesQueryParams', () => {
  it('至少姓名或地区', () => {
    expect(buildWhitepagesQueryParams({})).toBeNull();
    expect(buildWhitepagesQueryParams({ name: 'J' })).toBeNull();
  });

  it('构建 name + region 参数', () => {
    const params = buildWhitepagesQueryParams({
      name: 'John Smith',
      region: 'Seattle, WA',
    });
    expect(params).not.toBeNull();
    expect(params!.get('name')).toBe('John Smith');
    expect(params!.get('city')).toBe('Seattle');
    expect(params!.get('state_code')).toBe('WA');
    expect(params!.get('include_fuzzy_matching')).toBe('true');
  });
});

describe('searchWhitepagesOwners company filter', () => {
  it('公司名在服务端过滤 results', async () => {
    const mockFetch = async () =>
      ({
        ok: true,
        json: async () => ({
          results: [
            { id: 'P1', name: 'A', company_name: 'Acme Pizza' },
            { id: 'P2', name: 'B', company_name: 'Other LLC' },
          ],
          metadata: { result_count: 2, page: 1, page_size: 15 },
        }),
      }) as Response;

    const out = await searchWhitepagesOwners(
      'test-key',
      { name: 'John', company: 'Pizza' },
      mockFetch,
    );
    expect(out.results).toHaveLength(1);
    expect(out.results[0].id).toBe('P1');
    expect(out.company_filter_applied).toBe(true);
    expect(out.total).toBe(1);
  });
});
