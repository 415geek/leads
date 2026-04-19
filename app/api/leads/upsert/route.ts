import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { calculateLeadScore } from '@/lib/scoring';
import { LeadCreateInput } from '@/types/lead';
import { getSourceById } from '@/lib/sources/registry';

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10; // max 10 requests per minute
const requestCounts = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = requestCounts.get(ip);

  if (!record || now > record.resetTime) {
    requestCounts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }

  record.count++;
  return true;
}

/**
 * n8n webhook 兼容层
 *
 * 旧 payload 可能：
 *   - 无 external_id / 无 metro_area → 由 source registry 查出 metro_area 补齐；
 *     无 external_id 的仍可入库，但走 (name, address, city) 回落去重索引（部分索引）
 *   - 含 (name, address) 组合冲突 → 老约束 leads_name_address_key 已删，
 *     现在按 (source, external_id) 或 (name, address, city) 去重
 */
type LegacyLeadPayload = LeadCreateInput & {
  external_id?: string;
  metro_area?: string;
};

export async function POST(request: NextRequest) {
  try {
    const webhookSecret = request.headers.get('x-webhook-secret');

    if (webhookSecret !== process.env.N8N_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: '请求过于频繁，请稍后重试' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const leads: LegacyLeadPayload[] = body.leads;

    if (!Array.isArray(leads)) {
      return NextResponse.json(
        { error: 'leads 必须是数组' },
        { status: 400 }
      );
    }

    if (leads.length === 0) {
      return NextResponse.json({ message: '没有数据需要处理', count: 0 });
    }

    const enriched = leads.map((lead) => {
      const source = lead.source || 'sf_gov';
      const srcCfg = getSourceById(source);
      return {
        ...lead,
        lead_score: calculateLeadScore(lead),
        city: lead.city || 'San Francisco',
        source,
        metro_area: lead.metro_area ?? srcCfg?.metro ?? null,
        external_id: lead.external_id ?? null,
      };
    });

    // 分两段写入：有 external_id 的走 (source, external_id) upsert；无 external_id 的走逐条 insert（回落部分索引）
    const withExt = enriched.filter((r) => !!r.external_id);
    const withoutExt = enriched.filter((r) => !r.external_id);

    let count = 0;

    if (withExt.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('leads')
        .upsert(withExt, { onConflict: 'source,external_id', ignoreDuplicates: false })
        .select('id');
      if (error) throw error;
      count += data?.length ?? 0;
    }

    if (withoutExt.length > 0) {
      // n8n 旧流量：可能没 external_id，按 (name, address, city) 已存在则跳过
      for (const row of withoutExt) {
        const { data: exists } = await supabaseAdmin
          .from('leads')
          .select('id')
          .eq('name', row.name)
          .eq('city', row.city)
          .ilike('address', row.address ?? '')
          .maybeSingle();
        if (exists) {
          // 已存在 → 更新 lead_score 等可变字段
          const { error: updErr } = await supabaseAdmin
            .from('leads')
            .update({
              phone: row.phone ?? undefined,
              cuisine_type: row.cuisine_type ?? undefined,
              license_date: row.license_date ?? undefined,
              license_type: row.license_type ?? undefined,
              source_raw: row.source_raw ?? undefined,
              lead_score: row.lead_score,
              metro_area: row.metro_area ?? undefined,
            })
            .eq('id', exists.id);
          if (updErr) {
            console.warn('n8n upsert update failed:', row.name, updErr.message);
          } else {
            count += 1;
          }
        } else {
          const { data, error } = await supabaseAdmin.from('leads').insert(row).select('id');
          if (error) {
            console.warn('n8n upsert insert skipped:', row.name, error.message);
            continue;
          }
          count += data?.length ?? 0;
        }
      }
    }

    return NextResponse.json({
      message: '导入成功',
      count,
    });
  } catch (error) {
    console.error('[POST /api/leads/upsert]', error);
    return NextResponse.json(
      { error: '导入失败，请稍后重试' },
      { status: 500 }
    );
  }
}
