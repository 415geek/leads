/**
 * Vercel Cron endpoint —— 每日拉取所有 enabled 数据源
 *
 * 触发：vercel.json 里配置的 cron（默认每日 03:00 UTC）
 * 鉴权：Authorization: Bearer <CRON_SECRET>  （Vercel 默认注入）
 * 行为：runPipeline → upsert leads → 返回 per-source 摘要
 *
 * 数据流与 /api/leads/import 共享 pipeline，只是：
 *   - 不限定 metro，跑全部 enabled 源
 *   - 无需用户登录
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { runPipeline, type PipelineLead } from '@/lib/pipeline/run';
import { dedupePipelineLeads } from '@/lib/pipeline/dedupe';
import { enabledSources } from '@/lib/sources/registry';
import { getDailyEnrichCount } from '@/lib/pipeline/enrich';

export const dynamic = 'force-dynamic';
// Cron 可能跑较久（8 源 + AI + Google）；放大 maxDuration
export const maxDuration = 300; // 5 minutes

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

function toRow(d: PipelineLead) {
  return {
    name: d.name,
    address: d.address,
    phone: d.phone,
    cuisine_type: d.cuisine_type,
    city: d.city,
    metro_area: d.metro_area,
    source: d.source,
    external_id: d.external_id,
    license_date: d.license_date,
    first_inspection_date: d.first_inspection_date,
    license_type: d.license_type,
    source_raw: d.source_raw,
    lead_status: d.lead_status,
    lead_score: d.lead_score,
    is_restaurant_confidence: d.is_restaurant_confidence,
    ai_classification: d.ai_classification,
  };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const activeSourceIds = enabledSources().map((s) => s.id);

  const { sinceDate, sourceResults, leads, droppedNonRestaurant, enrichmentCalls } =
    await runPipeline({ sourceIds: activeSourceIds });

  const deduped = dedupePipelineLeads(leads);
  const withExt = deduped.filter((r) => !!r.external_id);
  const withoutExt = deduped.filter((r) => !r.external_id);

  let imported = 0;

  if (withExt.length > 0) {
    const rows = withExt.map(toRow);
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { data, error } = await supabaseAdmin
        .from('leads')
        .upsert(chunk, { onConflict: 'source,external_id', ignoreDuplicates: false })
        .select('id');
      if (error) {
        console.error('[cron] upsert(withExt) chunk failed:', error.message);
        continue;
      }
      imported += data?.length ?? 0;
    }
  }

  for (const row of withoutExt) {
    const mapped = toRow(row);
    const { data: exists } = await supabaseAdmin
      .from('leads')
      .select('id')
      .eq('name', mapped.name)
      .eq('city', mapped.city)
      .ilike('address', mapped.address ?? '')
      .maybeSingle();
    if (!exists) {
      const { data, error } = await supabaseAdmin.from('leads').insert(mapped).select('id');
      if (error) continue;
      imported += data?.length ?? 0;
    }
  }

  const elapsedMs = Date.now() - startedAt;

  return NextResponse.json({
    success: true,
    imported,
    total: deduped.length,
    droppedNonRestaurant,
    enrichmentCalls,
    enrichmentDailyCounter: getDailyEnrichCount(),
    sinceDate,
    sources: sourceResults,
    elapsedMs,
  });
}
