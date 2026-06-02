import { NextRequest } from 'next/server';
import { listLeadFilings } from '@/lib/leads/query-leads';
import { appendFilings, leadExists, replaceCaSosFilings } from '@/lib/lead-filings';
import { v1Json, v1Error } from '@/lib/api-v1/response';
import { withApiV1AuthParams } from '@/lib/api-v1/with-auth';
import type { LeadFilingInput } from '@/types/lead';

export const GET = withApiV1AuthParams<{ id: string }>(
  async (_request: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    const filings = await listLeadFilings(id);
    return v1Json({ filings });
  },
);

type PostBody = {
  mode?: 'append' | 'replace_ca_sos';
  filings: LeadFilingInput[];
};

export const POST = withApiV1AuthParams<{ id: string }>(
  async (request: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    const body = (await request.json()) as PostBody;

    if (!Array.isArray(body.filings)) {
      return v1Error('filings 须为数组', 400);
    }

    const exists = await leadExists(id);
    if (!exists) {
      return v1Error('Lead 不存在', 404);
    }

    for (const f of body.filings) {
      if (!f?.filing_type || !String(f.filing_type).trim()) {
        return v1Error('每条备案须包含 filing_type', 400);
      }
    }

    const mode = body.mode ?? 'append';

    if (mode === 'replace_ca_sos') {
      const rows = await replaceCaSosFilings(id, body.filings);
      return v1Json({ ok: true, mode, count: rows.length });
    }

    const { inserted, errors } = await appendFilings(id, body.filings);
    return v1Json({
      ok: true,
      mode: 'append',
      inserted,
      errors: errors.length ? errors : undefined,
    });
  },
  'write',
);
