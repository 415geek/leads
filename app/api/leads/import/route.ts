/**
 * /api/leads/import —— 单源 / 单 metro / 列出源 三种模式
 *
 * 数据流：
 *
 *   client POST {sourceId} ──▶ decideImportMode → runPipeline({singleSourceId})
 *                                    ↓
 *                           writePipelineLeads (缺列自动降级)
 *                                    ↓
 *                             返回 sources[] + imported 计数
 *
 * 默认 skipClassify=true / skipEnrich=true（AI 分类 + Google Places 慢，放后续任务）
 *
 * 模式决策（详见 lib/pipeline/api-helpers.ts decideImportMode）：
 *   body.sourceId  → 单源（前端循环用，每次 <15s）
 *   body.metro=X   → 跑 metro X 下所有源
 *   body.metro=all → 仅返回 sourceIds 列表，由前端 loop 回来逐个调（不再同步执行全部）
 *   GET ?listSources=1 → 仅返回列表（给前端 loop 起手）
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  enabledMetros,
  enabledSources,
  getSourceById,
  sourcesForMetro,
} from '@/lib/sources/registry';
import { runPipeline } from '@/lib/pipeline/run';
import { dedupePipelineLeads } from '@/lib/pipeline/dedupe';
import { writePipelineLeads } from '@/lib/pipeline/write-leads';
import { decideImportMode, CHINESE_TAGS } from '@/lib/pipeline/api-helpers';

// 单源 import 目标 ≤15s；设 60s 足够应付最慢源 + Supabase upsert
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const decision = decideImportMode(body, {
      enabledMetros: () => enabledMetros(),
      sourcesForMetro: (m) => sourcesForMetro(m),
      enabledSourceIds: () => enabledSources().map((s) => s.id),
      sourceExists: (id) => !!getSourceById(id),
    });

    if (decision.mode === 'invalid') {
      return NextResponse.json(
        { success: false, error: decision.reason ?? 'invalid request' },
        { status: 400 },
      );
    }

    // list 模式：只返回启用源 id 列表，让前端自己循环
    if (decision.mode === 'list') {
      return NextResponse.json({
        success: true,
        mode: 'list',
        metro: 'all',
        sourceIds: decision.sourceIds,
        message: `共 ${decision.sourceIds.length} 个启用源；请前端逐个调用 POST {"sourceId":"<id>"}`,
      });
    }

    // single / metro 模式：实际跑 pipeline
    const {
      sinceDate,
      sourceResults,
      leads,
      droppedNonRestaurant,
      enrichmentCalls,
    } = await runPipeline({
      sourceIds: decision.sourceIds,
      skipClassify: true,
      skipEnrich: true,
    });

    const deduped: typeof leads = dedupePipelineLeads(leads);

    if (deduped.length === 0) {
      const anyOk = sourceResults.some((s) => s.ok);
      return NextResponse.json({
        success: anyOk,
        mode: decision.mode,
        message: anyOk
          ? '数据源无符合筛选的新增行（或已全部存在）'
          : '数据源请求失败，未导入',
        imported: 0,
        total: 0,
        chineseTagged: 0,
        droppedNonRestaurant,
        enrichmentCalls,
        sinceDate,
        metro: decision.metroLabel,
        sources: sourceResults,
      });
    }

    let imported = 0;
    let degraded = false;
    let schemaHint: string | undefined;
    try {
      const result = await writePipelineLeads(supabaseAdmin, deduped);
      imported = result.imported;
      degraded = result.degraded;
      schemaHint = result.schemaHint;
    } catch (err) {
      console.error('[POST /api/leads/import] write error:', err);
      return NextResponse.json(
        {
          success: false,
          mode: decision.mode,
          error: err instanceof Error ? err.message : 'Database write failed',
          metro: decision.metroLabel,
          sources: sourceResults,
        },
        { status: 500 },
      );
    }

    const chineseTagged = leads.filter((l) =>
      CHINESE_TAGS.includes(l.cuisine_type),
    ).length;

    return NextResponse.json({
      success: true,
      mode: decision.mode,
      message: `成功写入 ${imported} 条（合并拉取 ${deduped.length} 条${
        degraded ? '；schema 未迁移已降级' : ''
      }）`,
      imported,
      total: deduped.length,
      chineseTagged,
      droppedNonRestaurant,
      enrichmentCalls,
      sinceDate,
      metro: decision.metroLabel,
      sources: sourceResults,
      degraded,
      schemaHint,
    });
  } catch (error) {
    console.error('[POST /api/leads/import]', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Import failed',
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const listSources = url.searchParams.get('listSources');

  // 列出启用源 id 列表 —— 前端 loop 起手用
  if (listSources === '1' || listSources === 'true') {
    const all = enabledSources();
    return NextResponse.json({
      sourceIds: all.map((s) => s.id),
      sources: all.map((s) => ({
        id: s.id,
        label: s.label,
        metro: s.metro,
        kind: s.kind,
      })),
    });
  }

  const metros = enabledMetros();
  return NextResponse.json({
    message:
      'POST JSON: { "sourceId":"<id>" } 单源执行 | { "metro":"<metro-id>" } 跑 metro 下全部源 | { "metro":"all" } 仅列出源 id 由前端循环。GET ?listSources=1 获取源列表。',
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
