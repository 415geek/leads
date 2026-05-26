import { NextResponse } from 'next/server';
import { runDeepPersonIntel, type DeepIntelSeed } from '@/lib/intel/deep-person-intel';

const MAX_LEN = 200;

function trimField(value: unknown, max = MAX_LEN): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v ? v.slice(0, max) : null;
}

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      return NextResponse.json(
        {
          error: '未配置 Anthropic API 密钥',
          hint: '请在 Vercel 或 .env.local 设置 ANTHROPIC_API_KEY',
        },
        { status: 503 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const fullName = trimField(body.full_name, 120);
    if (!fullName) {
      return NextResponse.json(
        { error: '缺少 full_name（人物姓名）' },
        { status: 400 },
      );
    }

    const seed: DeepIntelSeed = {
      full_name: fullName,
      job_title: trimField(body.job_title, 160),
      job_company_name: trimField(body.job_company_name, 160),
      location_name: trimField(body.location_name, 160),
      linkedin_url: trimField(body.linkedin_url, 300),
      work_email: trimField(body.work_email, 200),
    };

    const result = await runDeepPersonIntel(seed);
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === 'EMPTY_NAME') {
      return NextResponse.json({ error: '缺少 full_name（人物姓名）' }, { status: 400 });
    }
    console.error('[POST /api/pdl/deep-search]', error);
    return NextResponse.json(
      { error: '深度查询失败', detail: msg.slice(0, 200) },
      { status: 502 },
    );
  }
}
