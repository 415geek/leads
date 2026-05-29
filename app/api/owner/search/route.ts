import { NextResponse } from 'next/server';
import { searchWhitepagesOwners } from '@/lib/whitepages/owner-search';

const MAX_FIELD_LEN = 120;

function trimField(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_FIELD_LEN);
}

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
    const name = trimField(body.name);
    const region = trimField(body.region);
    const company = trimField(body.company);

    const filled = [name, region, company].filter((v) => v.length >= 2);
    if (filled.length === 0) {
      return NextResponse.json(
        { error: '请至少填写姓名、地区或公司名中的一项（每项至少 2 个字符）' },
        { status: 400 },
      );
    }

    const result = await searchWhitepagesOwners(apiKey, { name, region, company });
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === 'EMPTY_QUERY') {
      return NextResponse.json({ error: '请至少填写一项搜索条件' }, { status: 400 });
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
      { error: 'Whitepages Pro 老板信息搜索失败', detail },
      { status: 502 },
    );
  }
}
