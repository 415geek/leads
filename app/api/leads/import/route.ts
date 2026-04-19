import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { enabledMetros, enabledSources, sourcesForMetro } from '@/lib/sources/registry';
import { runPipeline } from '@/lib/pipeline/run';
import { dedupePipelineLeads } from '@/lib/pipeline/dedupe';
import { parseMetroInput, CHINESE_TAGS } from '@/lib/pipeline/api-helpers';

// 跨城导入 + Socrata 并发可能较慢；放大 maxDuration
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    // 支持 metro='all'：跑 registry 里所有 enabled 源
    const rawMetro =
      body && typeof body === 'object'
        ? (body as { metro?: string; region?: string }).metro ??
          (body as { metro?: string; region?: string }).region
        : undefined;

    let metro: string;
    let sourceIds: string[];

    if (rawMetro === 'all') {
      metro = 'all';
      sourceIds = enabledSources().map((s) => s.id);
    } else {
      const parsed = parseMetroInput(body, enabledMetros()) ?? 'sf_bay';
      metro = parsed;
      sourceIds = sourcesForMetro(parsed).map((s) => s.id);
    }

    const { sinceDate, sourceResults, leads, droppedNonRestaurant, enrichmentCalls } =
      await runPipeline({ sourceIds });

    // pipeline 层已 normalize + classify + enrich + score，这里仅做 (source, external_id) 内存去重
    const deduped: typeof leads = dedupePipelineLeads(leads);

    if (deduped.length === 0) {
      const anyOk = sourceResults.some((s) => s.ok);
      return NextResponse.json({
        success: anyOk,
        message: anyOk
          ? '各数据源均无符合筛选的新增行（或已全部存在）'
          : '数据源请求失败，未导入',
        imported: 0,
        total: 0,
        chineseTagged: 0,
        droppedNonRestaurant,
        enrichmentCalls,
        sinceDate,
        metro,
        sources: sourceResults,
      });
    }

    // 把 pipeline lead 投射到 leads 表列
    const upsertRows = deduped.map((d) => ({
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
    }));

    // 先用 (source, external_id) 作为冲突键；没有 external_id 的行交由 Postgres 回落索引
    // （idx_leads_name_address_city_lower 部分索引）处理，Supabase client 对部分索引支持有限，
    // 这里采取两段式 upsert：有 external_id 的先上，其余按 (name, address, city) 软去重。
    const withExt = upsertRows.filter((r) => !!r.external_id);
    const withoutExt = upsertRows.filter((r) => !r.external_id);

    let imported = 0;

    if (withExt.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('leads')
        .upsert(withExt, { onConflict: 'source,external_id', ignoreDuplicates: false })
        .select('id');
      if (error) {
        console.error('Supabase upsert(withExt) error:', error);
        // Supabase schema 缺列（migration 未跑）/ 约束冲突 → 返回结构化错误让前端提示
        return NextResponse.json(
          {
            success: false,
            error: `Database error: ${error.message}`,
            hint: error.message.toLowerCase().includes('column')
              ? '可能是 Supabase schema migration 未执行。请在 Supabase SQL Editor 运行 supabase/schema.sql 底部的 V1 migration 块。'
              : undefined,
            metro,
            sources: sourceResults,
          },
          { status: 500 },
        );
      }
      imported += data?.length ?? 0;
    }

    if (withoutExt.length > 0) {
      // 没有 external_id：按行一个个判断，避免误覆盖
      for (const row of withoutExt) {
        const { data: exists } = await supabaseAdmin
          .from('leads')
          .select('id')
          .eq('name', row.name)
          .eq('city', row.city)
          .ilike('address', row.address ?? '')
          .maybeSingle();
        if (!exists) {
          const { data, error } = await supabaseAdmin.from('leads').insert(row).select('id');
          if (error) {
            console.warn('Supabase insert(withoutExt) skipped:', row.name, error.message);
            continue;
          }
          imported += data?.length ?? 0;
        }
      }
    }

    const chineseTagged = leads.filter((l) => CHINESE_TAGS.includes(l.cuisine_type)).length;

    return NextResponse.json({
      success: true,
      message: `成功写入 ${imported} 条新餐饮类 leads（合并拉取 ${deduped.length} 条，AI 丢弃非餐厅 ${droppedNonRestaurant} 条）`,
      imported,
      total: deduped.length,
      chineseTagged,
      droppedNonRestaurant,
      enrichmentCalls,
      sinceDate,
      metro,
      sources: sourceResults,
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Import failed',
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  const metros = enabledMetros();
  return NextResponse.json({
    message:
      'POST JSON {"metro":"<metro-id>"} 从对应开放数据导入餐饮线索；缺省为 sf_bay。支持的 metro 见 "metros"。',
    metros: metros.map((m) => ({
      id: m,
      sources: sourcesForMetro(m).map((s) => ({
        id: s.id,
        label: s.label,
        kind: s.kind,
        portal: s.portalUrl,
        enabled: s.enabled,
      })),
    })),
  });
}
