import { NextResponse } from 'next/server';
import { runOwnerKeywordMatch } from '@/lib/whitepages/owner-keyword-match';
import { searchWhitepagesOwners } from '@/lib/whitepages/owner-search';

const MAX_FIELD_LEN = 200;

function trimField(value: unknown, max = MAX_FIELD_LEN): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const apiKey = process.env.WHITEPAGES_PRO_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        {
          error: '未配置 Whitepages Pro API 密钥',
          hint: '请在 Vercel 或 .env.local 设置 WHITEPAGES_PRO_API_KEY',
        },
        { status: 503 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const name = trimField(body.name, 120);
    const region = trimField(body.region, 120);
    const keywords = trimField(body.keywords, 200);

    if (name.length < 2) {
      return NextResponse.json(
        { error: '请先填写姓名（至少 2 个字符），再基于 Whitepages 结果做关键字交叉验证' },
        { status: 400 },
      );
    }

    const wpResult = await searchWhitepagesOwners(apiKey, { name, region });

    if (keywords.length >= 2 && wpResult.results.length > 0) {
      if (!process.env.ANTHROPIC_API_KEY?.trim()) {
        return NextResponse.json(
          {
            error: '未配置 Anthropic API 密钥，无法执行匹配关键字交叉验证',
            hint: '请在 Vercel 或 .env.local 设置 ANTHROPIC_API_KEY',
          },
          { status: 503 },
        );
      }

      const matchResult = await runOwnerKeywordMatch({
        name,
        region: region || undefined,
        keywords,
        candidates: wpResult.results,
      });

      return NextResponse.json({
        ...wpResult,
        results: matchResult.results,
        keyword_analysis_applied: true,
        analyses: matchResult.analyses,
        analysis_model: matchResult.model,
        web_snippets_used: matchResult.web_snippets_used,
        keywords,
      });
    }

    return NextResponse.json({
      ...wpResult,
      keyword_analysis_applied: false,
      analyses: {},
      keywords: keywords || undefined,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === 'EMPTY_QUERY') {
      return NextResponse.json({ error: '请至少填写姓名' }, { status: 400 });
    }
    if (msg === 'EMPTY_KEYWORDS' || msg === 'NO_CANDIDATES') {
      return NextResponse.json({ error: '匹配关键字验证失败' }, { status: 400 });
    }
    if (msg.startsWith('WP_429')) {
      return NextResponse.json(
        { error: 'Whitepages Pro 请求过于频繁，请稍后再试' },
        { status: 429 },
      );
    }
    if (msg.startsWith('WP_403')) {
      return NextResponse.json(
        { error: 'Whitepages Pro API 密钥无效或已过期', detail: msg.replace(/^WP_403:/, '') },
        { status: 403 },
      );
    }
    console.error('[POST /api/owner/search]', error);
    const detail = msg.replace(/^WP_\d+:/, '');
    return NextResponse.json(
      { error: '老板信息搜索或关键字交叉验证失败', detail },
      { status: 502 },
    );
  }
}
