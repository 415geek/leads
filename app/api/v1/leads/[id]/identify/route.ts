import { supabaseAdmin } from '@/lib/supabase';
import { v1IdentifyLead } from '@/lib/api-v1/evidence-routes';
import { withApiV1AuthParams } from '@/lib/api-v1/with-auth';

export const maxDuration = 60;

export const POST = withApiV1AuthParams<{ id: string }>(
  async (_request, _ctx, { params }) => {
    const { id } = await params;
    return v1IdentifyLead(supabaseAdmin, id);
  },
  'write',
);
