import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  buildDeepSearchQueries,
  runDeepPersonIntel,
} from '../lib/intel/deep-person-intel';
import type { TavilySnippet } from '../lib/opening-intel-web';

describe('buildDeepSearchQueries', () => {
  it('应该围绕姓名 + 公司 + 地区生成多组带引号的关键词', () => {
    const queries = buildDeepSearchQueries({
      full_name: 'Lingyu Lai',
      job_company_name: 'Geeky Iot',
      location_name: 'San Francisco, California',
    });
    expect(queries.length).toBeGreaterThanOrEqual(3);
    expect(queries[0]).toContain('"Lingyu Lai"');
    expect(queries[0]).toContain('"Geeky Iot"');
    expect(queries.some((q) => q.includes('email OR contact'))).toBe(true);
    expect(queries.some((q) => q.includes('linkedin OR profile'))).toBe(true);
    expect(queries.some((q) => q.includes('phone OR address'))).toBe(true);
  });

  it('应该去重等价查询', () => {
    const queries = buildDeepSearchQueries({ full_name: 'Alice' });
    const set = new Set(queries);
    expect(set.size).toBe(queries.length);
  });
});

describe('runDeepPersonIntel', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  it('未传姓名时抛 EMPTY_NAME', async () => {
    await expect(
      runDeepPersonIntel({ full_name: '   ' } as never),
    ).rejects.toThrow('EMPTY_NAME');
  });

  it('过滤所有 source_url 不在 Tavily 摘要中的联系方式', async () => {
    const fakeSnippets: TavilySnippet[] = [
      {
        title: 'Geeky Iot Team',
        url: 'https://geekyiot.com/team',
        content: 'Lingyu Lai is the founder of Geeky Iot. Email: lingyu@geekyiot.com',
      },
    ];

    const fakeClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                match_confidence: 88,
                emails: [
                  {
                    value: 'lingyu@geekyiot.com',
                    source_url: 'https://geekyiot.com/team',
                    confidence: 90,
                  },
                  {
                    value: 'fake@hallucinated.com',
                    source_url: 'https://does-not-exist.example.com',
                    confidence: 70,
                  },
                ],
                phones: [],
                addresses: [],
                websites: [],
                socials: [],
                summary_zh: '已确认是同一人。',
                rationale_zh: '官网团队页直接列出姓名和邮箱。',
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

    expect(fakeClient.messages.create).toHaveBeenCalledTimes(1);
    expect(result.match_confidence).toBe(88);
    expect(result.emails).toHaveLength(1);
    expect(result.emails[0].value).toBe('lingyu@geekyiot.com');
    expect(result.search_snippets_used).toBe(1);
    expect(result.evidence[0].url).toBe('https://geekyiot.com/team');
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
    expect(result.phones).toEqual([]);
  });
});
