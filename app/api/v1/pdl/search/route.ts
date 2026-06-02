import { NextRequest } from 'next/server';
import { searchPdlPersons } from '@/lib/pdl/person-search';
import { v1Json, v1Error } from '@/lib/api-v1/response';
import { withApiV1Auth } from '@/lib/api-v1/with-auth';

const MAX_FIELD_LEN = 120;

function trimField(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_FIELD_LEN);
}

export const POST = withApiV1Auth(
  async (request: NextRequest) => {
    const apiKey = process.env.PEOPLE_DATA_LABS_API_KEY?.trim();
    if (!apiKey) {
      return v1Error(
        '未配置 People Data Labs API 密钥',
        503,
        '请设置 PEOPLE_DATA_LABS_API_KEY',
      );
    }

    const body = await request.json().catch(() => ({}));
    const name = trimField(body.name);
    const region = trimField(body.region);
    const company = trimField(body.company);

    const filled = [name, region, company].filter((v) => v.length >= 2);
    if (filled.length === 0) {
      return v1Error('请至少填写姓名、地区或公司名中的一项（每项至少 2 个字符）', 400);
    }

    try {
      const result = await searchPdlPersons(apiKey, { name, region, company });
      return v1Json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg === 'EMPTY_QUERY') {
        return v1Error('请至少填写一项搜索条件', 400);
      }
      if (msg.startsWith('PDL_429')) {
        return v1Error('People Data Labs 请求过于频繁，请稍后再试', 429);
      }
      throw error;
    }
  },
  'write',
);
