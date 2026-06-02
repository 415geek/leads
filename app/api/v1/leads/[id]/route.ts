import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getLeadById } from '@/lib/leads/query-leads';
import { v1Json, v1Error } from '@/lib/api-v1/response';
import { withApiV1AuthParams } from '@/lib/api-v1/with-auth';
import type { LeadUpdateInput } from '@/types/lead';

export const GET = withApiV1AuthParams<{ id: string }>(
  async (_request: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    const result = await getLeadById(id);
    if (!result.lead) {
      return v1Error('Lead 不存在', 404);
    }

    return v1Json({
      lead: result.lead,
      filing_portal: result.filing_portal,
      links: result.links,
    });
  },
);

export const PATCH = withApiV1AuthParams<{ id: string }>(
  async (request: NextRequest, _ctx, { params }) => {
    const { id } = await params;
    const body = (await request.json()) as LeadUpdateInput;

    const { data, error } = await supabaseAdmin
      .from('leads')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return v1Error('Lead 不存在', 404);
      }
      throw error;
    }

    return v1Json({ lead: data });
  },
  'write',
);
