import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { v1PropertyLookupLead } from '@/lib/api-v1/evidence-routes';
import { v1Error } from '@/lib/api-v1/response';
import { withApiV1Auth } from '@/lib/api-v1/with-auth';

export const maxDuration = 60;

export const POST = withApiV1Auth(async (request: NextRequest) => {
  const body = await request.json().catch(() => ({}));
  const leadId =
    typeof body.leadId === 'string'
      ? body.leadId.trim()
      : typeof body.lead_id === 'string'
        ? body.lead_id.trim()
        : '';
  if (!leadId) {
    return v1Error('leadId is required', 400);
  }
  return v1PropertyLookupLead(supabaseAdmin, leadId);
}, 'write');
