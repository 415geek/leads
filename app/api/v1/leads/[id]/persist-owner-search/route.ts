import { supabaseAdmin } from '@/lib/supabase';
import { v1PersistOwnerSearchLead } from '@/lib/api-v1/evidence-routes';

export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: leadId } = await context.params;
  const body = await request.json().catch(() => ({}));
  return v1PersistOwnerSearchLead(supabaseAdmin, leadId, body);
}
