import type { LeadFilingInput, LeadFilingSource } from '@/types/lead';
import { supabaseAdmin } from '@/lib/supabase';

export async function leadExists(leadId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('id')
    .eq('id', leadId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

function normalizeRows(leadId: string, filings: LeadFilingInput[]) {
  return filings.map((f) => ({
    lead_id: leadId,
    filing_type: String(f.filing_type).trim(),
    control_id: f.control_id?.trim() || null,
    filed_date: f.filed_date?.trim() || null,
    document_url: f.document_url?.trim() || null,
    source: (f.source ?? 'ca_sos') as LeadFilingSource,
  }));
}

/** 删除该 lead 下所有 CA SOS 同步来源的备案，再批量插入（n8n / 手动全量替换用） */
export async function replaceCaSosFilings(leadId: string, filings: LeadFilingInput[]) {
  const { error: delErr } = await supabaseAdmin
    .from('lead_filings')
    .delete()
    .eq('lead_id', leadId)
    .eq('source', 'ca_sos');
  if (delErr) throw delErr;

  if (filings.length === 0) return [] as { id: string }[];

  const rows = normalizeRows(leadId, filings).map((r) => ({ ...r, source: 'ca_sos' as const }));
  const { data, error } = await supabaseAdmin.from('lead_filings').insert(rows).select('id');
  if (error) throw error;
  return data ?? [];
}

/** 逐条追加；control_id 重复时由数据库唯一索引拒绝单条 */
export async function appendFilings(leadId: string, filings: LeadFilingInput[]) {
  if (filings.length === 0) return { inserted: 0, errors: [] as string[] };
  const rows = normalizeRows(leadId, filings);
  const errors: string[] = [];
  let inserted = 0;
  for (const row of rows) {
    const { error } = await supabaseAdmin.from('lead_filings').insert(row);
    if (error) {
      errors.push(`${row.filing_type}: ${error.message}`);
    } else {
      inserted++;
    }
  }
  return { inserted, errors };
}
