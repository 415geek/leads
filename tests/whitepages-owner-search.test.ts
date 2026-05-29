import { describe, expect, it } from 'vitest';
import {
  buildWhitepagesQueryParams,
  parseAddressInput,
  parseRegionInput,
  resolveOwnerSearchContext,
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
  it('至少姓名、地区或地址之一', () => {
    expect(buildWhitepagesQueryParams({})).toBeNull();
    expect(buildWhitepagesQueryParams({ name: 'J' })).toBeNull();
    expect(buildWhitepagesQueryParams({ address: 'ab' })).toBeNull();
  });

  it('支持仅地址查询', () => {
    const params = buildWhitepagesQueryParams({
      address: '2406 19th Ave, San Francisco, CA 94116',
    });
    expect(params).not.toBeNull();
    expect(params!.get('street')).toBe('2406 19th Ave');
    expect(params!.get('city')).toBe('San Francisco');
    expect(params!.get('state_code')).toBe('CA');
    expect(params!.has('name')).toBe(false);
  });

  it('地址与地区重复城市时拆分 street', () => {
    const params = buildWhitepagesQueryParams({
      address: '2406 19TH AVE SAN FRANCISCO',
      region: 'San Francisco, CA',
    });
    expect(params!.get('street')).toBe('2406 19TH AVE');
    expect(params!.get('city')).toBe('San Francisco');
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

  it('构建 name + address 参数', () => {
    const params = buildWhitepagesQueryParams({
      name: 'Tony Lu',
      address: '123 Market St, San Francisco, CA 94102',
    });
    expect(params).not.toBeNull();
    expect(params!.get('street')).toBe('123 Market St');
    expect(params!.get('city')).toBe('San Francisco');
    expect(params!.get('state_code')).toBe('CA');
    expect(params!.get('zipcode')).toBe('94102');
  });
});

describe('parseAddressInput', () => {
  it('解析完整地址', () => {
    expect(parseAddressInput('123 Market St, San Francisco, CA 94102')).toEqual({
      street: '123 Market St',
      city: 'San Francisco',
      state_code: 'CA',
      zipcode: '94102',
    });
  });

  it('仅街道时保留 street', () => {
    expect(parseAddressInput('123 Market St')).toEqual({ street: '123 Market St' });
  });
});

describe('resolveOwnerSearchContext', () => {
  it('仅地址时可查询并触发交叉验证', () => {
    const ctx = resolveOwnerSearchContext({
      address: '2406 19th Ave, San Francisco, CA',
    });
    expect(ctx.queryValid).toBe(true);
    expect(ctx.hasAddress).toBe(true);
    expect(ctx.shouldRunKeywordAnalysis).toBe(true);
    expect(ctx.keywordsForMatch).toContain('2406 19th Ave');
  });

  it('姓名+关键字优先使用关键字', () => {
    const ctx = resolveOwnerSearchContext({
      name: 'Paul Chu',
      keywords: 'Wai Leung Chu',
    });
    expect(ctx.keywordsForMatch).toBe('Wai Leung Chu');
    expect(ctx.nameForPrompt).toBe('Paul Chu');
  });
});

describe('searchWhitepagesOwners', () => {
  it('返回 Whitepages 原始结果', async () => {
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
      { name: 'John', region: 'SF' },
      mockFetch,
    );
    expect(out.results).toHaveLength(2);
    expect(out.total).toBe(2);
  });
});
