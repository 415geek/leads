import { NextRequest } from 'next/server';
import { runOwnerKeywordMatch } from '@/lib/whitepages/owner-keyword-match';
import { resolveOwnerSearchContext, searchWhitepagesOwners } from '@/lib/whitepages/owner-search';
import { v1Json, v1Error } from '@/lib/api-v1/response';
import { withApiV1Auth } from '@/lib/api-v1/with-auth';

const MAX_FIELD_LEN = 200;

function trimField(value: unknown, max = MAX_FIELD_LEN): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

export const maxDuration = 120;

export const POST = withApiV1Auth(
  async (request: NextRequest) => {
    const apiKey = process.env.WHITEPAGES_PRO_API_KEY?.trim();
    if (!apiKey) {
      return v1Error(
        '未配置 Whitepages Pro API 密钥',
        503,
        '请在环境变量设置 WHITEPAGES_PRO_API_KEY',
      );
    }

    const body = await request.json().catch(() => ({}));
    const name = trimField(body.name, 120);
    const region = trimField(body.region, 120);
    const address = trimField(body.address, 200);
    const keywords = trimField(body.keywords, 200);
    const entityName = trimField(body.entityName, 200);
    const caEntityNumber = trimField(body.caEntityNumber, 40);

    const ctx = resolveOwnerSearchContext({ name, region, address, keywords });
    if (!ctx.queryValid) {
      return v1Error('请至少填写姓名、地址或地区之一（地址至少 3 个字符的街道信息）', 400);
    }

    const wpResult = await searchWhitepagesOwners(apiKey, { name, region, address });

    if (ctx.shouldRunKeywordAnalysis && wpResult.results.length > 0) {
      if (!process.env.ANTHROPIC_API_KEY?.trim()) {
        return v1Error(
          '未配置 Anthropic API 密钥，无法执行联网交叉验证',
          503,
          '请设置 ANTHROPIC_API_KEY',
        );
      }

      const matchResult = await runOwnerKeywordMatch({
        name: name || undefined,
        region: region || undefined,
        address: address || undefined,
        keywords: keywords || undefined,
        entityName: entityName || undefined,
        caEntityNumber: caEntityNumber || undefined,
        candidates: wpResult.results,
      });

      return v1Json({
        ...wpResult,
        results: matchResult.results,
        keyword_analysis_applied: true,
        analyses: matchResult.analyses,
        analysis_model: matchResult.model,
        web_snippets_used: matchResult.web_snippets_used,
        registry_snippets_used: matchResult.registry_snippets_used,
        opencorporates_companies_found: matchResult.opencorporates_companies_found,
        keywords: ctx.keywordsForMatch,
        search_mode: ctx.hasName ? 'name' : ctx.hasAddress ? 'address' : 'region',
      });
    }

    return v1Json({
      ...wpResult,
      keyword_analysis_applied: false,
      analyses: {},
      keywords: keywords || undefined,
      search_mode: ctx.hasName ? 'name' : ctx.hasAddress ? 'address' : 'region',
    });
  },
  'write',
);
