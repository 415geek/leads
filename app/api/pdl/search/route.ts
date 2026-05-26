import { NextResponse } from 'next/server';
import { searchPdlPersons } from '@/lib/pdl/person-search';

const MAX_FIELD_LEN = 120;

function trimField(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_FIELD_LEN);
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.PEOPLE_DATA_LABS_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        {
          error: '未配置 People Data Labs API 密钥',
          hint: '请在 Vercel 或 .env.local 设置 PEOPLE_DATA_LABS_API_KEY',
        },
        { status: 503 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const name = trimField(body.name);
    const region = trimField(body.region);
    const company = trimField(body.company);

    const fields = [
      { key: 'name', value: name },
      { key: 'region', value: region },
      { key: 'company', value: company },
    ];
    const filled = fields.filter((f) => f.value.length >= 2);
    if (filled.length === 0) {
      return NextResponse.json(
        { error: '请至少填写姓名、地区或公司名中的一项（每项至少 2 个字符）' },
        { status: 400 },
      );
    }

    const result = await searchPdlPersons(apiKey, { name, region, company });
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === 'EMPTY_QUERY') {
      return NextResponse.json({ error: '请至少填写一项搜索条件' }, { status: 400 });
    }
    if (msg.startsWith('PDL_429')) {
      return NextResponse.json(
        { error: 'People Data Labs 请求过于频繁，请稍后再试' },
        { status: 429 },
      );
    }
    console.error('[POST /api/pdl/search]', error);
    const detail = msg.replace(/^PDL_\d+:/, '');
    return NextResponse.json(
      { error: 'People Data Labs 搜索失败', detail },
      { status: 502 },
    );
  }
}
