import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  buildDeepSearchQueries,
  runDeepPersonIntel,
  PEOPLE_SEARCH_DOMAINS,
  BUSINESS_SEARCH_DOMAINS,
  type TavilySnippetWithBucket,
} from '../lib/intel/deep-person-intel';

describe('PEOPLE_SEARCH_DOMAINS', () => {
  it('应该包含 whitepages / 411 / clustrmaps 等', () => {
    expect(PEOPLE_SEARCH_DOMAINS).toContain('whitepages.com');
    expect(PEOPLE_SEARCH_DOMAINS).toContain('411.com');
    expect(PEOPLE_SEARCH_DOMAINS).toContain('clustrmaps.com');
    expect(PEOPLE_SEARCH_DOMAINS).toContain('truepeoplesearch.com');
    expect(PEOPLE_SEARCH_DOMAINS).toContain('spokeo.com');
  });
});

describe('BUSINESS_SEARCH_DOMAINS', () => {
  it('应该包含 LinkedIn / Crunchbase', () => {
    expect(BUSINESS_SEARCH_DOMAINS).toContain('linkedin.com');
    expect(BUSINESS_SEARCH_DOMAINS).toContain('crunchbase.com');
  });
});

describe('buildDeepSearchQueries', () => {
  it('应该生成 people-search 和商务两批查询', () => {
    const { peopleQueries, businessQueries } = buildDeepSearchQueries({
      full_name: 'Lingyu Lai',
      job_company_name: 'Geeky Iot',
      location_name: 'San Francisco, California',
    });

    expect(peopleQueries.length).toBeGreaterThanOrEqual(3);
    expect(peopleQueries.some((q) => q.includes('phone'))).toBe(true);
    expect(peopleQueries.some((q) => q.includes('address'))).toBe(true);
    expect(peopleQueries.some((q) => q.includes('relatives'))).toBe(true);
    expect(peopleQueries[0]).toContain('"Lingyu Lai"');

    expect(businessQueries.length).toBeGreaterThanOrEqual(1);
    expect(businessQueries.some((q) => q.includes('"Geeky Iot"'))).toBe(true);
    expect(businessQueries.some((q) => q.includes('email'))).toBe(true);
  });

  it('应该去重', () => {
    const { peopleQueries, businessQueries } = buildDeepSearchQueries({
      full_name: 'Alice',
    });
    expect(new Set(peopleQueries).size).toBe(peopleQueries.length);
    expect(new Set(businessQueries).size).toBe(businessQueries.length);
  });
});

describe('runDeepPersonIntel', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it('未传姓名时抛 EMPTY_NAME', async () => {
    await expect(
      runDeepPersonIntel({ full_name: '   ' } as never),
    ).rejects.toThrow('EMPTY_NAME');
  });

  it('过滤所有 source_url 不在 Tavily 摘要中的联系方式；保留 bucket 分类', async () => {
    const fakeSnippets: TavilySnippetWithBucket[] = [
      {
        title: 'Lingyu Lai - San Francisco, CA | Whitepages',
        url: 'https://www.whitepages.com/name/Lingyu-Lai/San-Francisco-CA',
        content:
          'Lingyu Lai, age 30-34, lives in San Francisco, CA. Possible relatives: Min Lai, Wei Lai.',
        bucket: 'people_search',
      },
      {
        title: 'Lingyu Lai LinkedIn',
        url: 'https://www.linkedin.com/in/lingyu-lai',
        content: 'Lingyu Lai works at Geeky Iot in San Francisco.',
        bucket: 'business',
      },
    ];

    const fakeClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                match_confidence: 78,
                emails: [],
                phones: [],
                addresses: [
                  {
                    value: 'San Francisco, CA',
                    source_url: 'https://www.whitepages.com/name/Lingyu-Lai/San-Francisco-CA',
                    confidence: 60,
                    note: 'Whitepages lookup',
                  },
                ],
                websites: [],
                socials: [
                  {
                    value: 'https://www.linkedin.com/in/lingyu-lai',
                    source_url: 'https://www.linkedin.com/in/lingyu-lai',
                    confidence: 85,
                  },
                ],
                possible_relatives: [
                  {
                    value: 'Min Lai',
                    source_url: 'https://www.whitepages.com/name/Lingyu-Lai/San-Francisco-CA',
                    confidence: 55,
                  },
                  {
                    value: 'Hallucinated Person',
                    source_url: 'https://does-not-exist.example.com',
                    confidence: 90,
                  },
                ],
                age_range: [
                  {
                    value: '30-34',
                    source_url: 'https://www.whitepages.com/name/Lingyu-Lai/San-Francisco-CA',
                    confidence: 50,
                  },
                ],
                summary_zh: '✅ 已确认',
                rationale_zh: 'Whitepages 与 LinkedIn 均匹配。',
              }),
            },
          ],
        }),
      },
    };

    const result = await runDeepPersonIntel(
      {
        full_name: 'Lingyu Lai',
        job_company_name: 'Geeky Iot',
        location_name: 'San Francisco',
      },
      {
        searchOverride: async () => fakeSnippets,
        anthropic: fakeClient as never,
      },
    );

    expect(result.match_confidence).toBe(78);
    expect(result.addresses).toHaveLength(1);
    expect(result.addresses[0].value).toBe('San Francisco, CA');
    expect(result.socials).toHaveLength(1);
    expect(result.possible_relatives).toHaveLength(1);
    expect(result.possible_relatives[0].value).toBe('Min Lai');
    expect(result.age_range[0].value).toBe('30-34');

    expect(result.people_search_hits).toBe(1);
    expect(result.business_hits).toBe(1);
    expect(result.evidence[0].bucket).toBe('people_search');
    expect(result.evidence[1].bucket).toBe('business');
  });

  it('无 Tavily 摘要时强制 match_confidence ≤ 20 且联系方式全部清空', async () => {
    const fakeClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                match_confidence: 95,
                emails: [
                  { value: 'x@y.com', source_url: 'https://a.com', confidence: 80 },
                ],
                phones: [],
                addresses: [],
                websites: [],
                socials: [],
                possible_relatives: [],
                age_range: [],
                summary_zh: 'fake',
                rationale_zh: 'fake',
              }),
            },
          ],
        }),
      },
    };

    const result = await runDeepPersonIntel(
      { full_name: 'Nobody' },
      {
        searchOverride: async () => [],
        anthropic: fakeClient as never,
      },
    );

    expect(result.match_confidence).toBe(20);
    expect(result.emails).toEqual([]);
    expect(result.addresses).toEqual([]);
    expect(result.possible_relatives).toEqual([]);
    expect(result.people_search_hits).toBe(0);
    expect(result.business_hits).toBe(0);
  });
});
