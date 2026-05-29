import { describe, expect, it, vi } from 'vitest';
import {
  buildOwnerKeywordWebQueries,
  runOwnerKeywordMatch,
} from '@/lib/whitepages/owner-keyword-match';

describe('buildOwnerKeywordWebQueries', () => {
  it('组合姓名、地区与关键字', () => {
    const q = buildOwnerKeywordWebQueries({
      name: 'Tony Lu',
      region: 'San Francisco, CA',
      keywords: 'Lu Kitchen 123 Market',
    });
    expect(q.generalQueries[0]).toContain('Tony Lu');
    expect(q.generalQueries[0]).toContain('Lu Kitchen');
    expect(q.peopleQueries[0]).toContain('San Francisco');
  });
});

describe('runOwnerKeywordMatch', () => {
  it('对候选人返回关键字匹配分并按分数排序', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const mockAnthropic = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: JSON.stringify([
                {
                  idx: 0,
                  keyword_match_score: 45,
                  summary_zh: '部分匹配',
                  rationale_zh: '店名不完全一致',
                  matched_signals: ['地区接近'],
                },
                {
                  idx: 1,
                  keyword_match_score: 88,
                  summary_zh: '高度匹配',
                  rationale_zh: '店名与地址均吻合',
                  matched_signals: ['店名一致', '地址一致'],
                },
              ]),
            },
          ],
        }),
      },
    };

    const result = await runOwnerKeywordMatch(
      {
        name: 'Tony Lu',
        region: 'San Francisco',
        keywords: 'Lu Kitchen Market St',
        candidates: [
          { id: 'P1', name: 'Tony K Lu', match_score: 93 },
          { id: 'P2', name: 'Tony Lu', match_score: 89 },
        ],
      },
      {
        anthropic: mockAnthropic as never,
        searchOverride: async () => [
          {
            title: 'Lu Kitchen SF',
            url: 'https://example.com/lu-kitchen',
            content: 'Tony Lu owner of Lu Kitchen on Market St',
            source: 'general',
          },
        ],
        registryEvidenceOverride: async () => ({
          jurisdiction_code: 'us_ca',
          opencorporates_companies: [
            {
              name: 'Lu Kitchen LLC',
              jurisdiction_code: 'us_ca',
              company_number: '123',
              registered_address: '123 Market St, San Francisco, CA',
              officers: [{ name: 'Tony Lu', position: 'director' }],
              opencorporates_url: 'https://opencorporates.com/companies/us_ca/123',
            },
          ],
          opencorporates_prompt: 'Lu Kitchen LLC director Tony Lu',
          registry_web_snippets: [
            {
              title: 'OpenCorporates Lu Kitchen',
              url: 'https://opencorporates.com/companies/us_ca/123',
              content: 'Tony Lu listed as director',
            },
          ],
        }),
      },
    );

    expect(result.results[0].id).toBe('P2');
    expect(result.analyses.P2?.keyword_match_score).toBe(88);
    expect(result.analyses.P1?.keyword_match_score).toBe(45);
    expect(result.web_snippets_used).toBe(1);
    expect(result.registry_snippets_used).toBe(1);
    expect(result.opencorporates_companies_found).toBe(1);
  });
});
