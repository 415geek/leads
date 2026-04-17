import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  LOOKBACK_DAYS,
  countChineseTagged,
} from '@/lib/bay-area-food-import';
import type { LeadRegionId } from '@/lib/region-config';
import { runFoodImportForRegion } from '@/lib/regional-food-import';

function parseRegion(body: unknown): LeadRegionId {
  if (
    body &&
    typeof body === 'object' &&
    'region' in body &&
    (body as { region?: string }).region === 'houston'
  ) {
    return 'houston';
  }
  return 'bay_area';
}

export async function POST(request: Request) {
  try {
    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const region = parseRegion(body);
    const { sinceDate, sourceResults, leads } = await runFoodImportForRegion(region);

    if (leads.length === 0) {
      const anyOk = sourceResults.some((s) => s.ok);
      return NextResponse.json({
        success: anyOk,
        message: anyOk
          ? '各数据源均无符合筛选的新增行（或已全部存在）'
          : '数据源请求失败，未导入',
        imported: 0,
        total: 0,
        chineseTagged: 0,
        sinceDate,
        region,
        sources: sourceResults,
      });
    }

    const { data, error } = await supabaseAdmin
      .from('leads')
      .upsert(leads, {
        onConflict: 'name,address',
        ignoreDuplicates: true,
      })
      .select();

    if (error) {
      console.error('Supabase upsert error:', error);
      throw new Error(`Database error: ${error.message}`);
    }

    const chineseTagged = countChineseTagged(leads);

    return NextResponse.json({
      success: true,
      message: `成功写入 ${data?.length ?? 0} 条新餐饮类 leads（合并拉取 ${leads.length} 条）`,
      imported: data?.length ?? 0,
      total: leads.length,
      chineseTagged,
      sinceDate,
      region,
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
  return NextResponse.json({
    message:
      'POST JSON {"region":"bay_area"|"houston"} 从对应开放数据导入餐饮线索；缺省为 bay_area',
    lookbackDaysSf: LOOKBACK_DAYS,
    regions: {
      bay_area: {
        portal: 'https://data.sfgov.org/',
        sources: [
          {
            id: 'sf_gov',
            city: 'Bay Area（DataSF，实地城市）',
            kind: 'new_business_location',
            dataset: 'https://data.sfgov.org/resource/g8m3-pdis.json',
            note: `近 ${LOOKBACK_DAYS} 天 location_start_date；state=CA 且 city 为湾区白名单；餐饮 NAICS/执照筛选`,
          },
          {
            id: 'berkeley_open_data',
            city: 'Berkeley',
            kind: 'active_license_snapshot',
            dataset: 'https://data.cityofberkeley.info/resource/rwnf-bu3w.json',
            note: '当前有效餐饮相关执照快照',
          },
        ],
      },
      houston: {
        portal: 'https://data.houstontx.gov/',
        sources: [
          {
            id: 'houston_hdhhs',
            kind: 'ckan_datastore_sql',
            dataset:
              'City of Houston HDHHS — Last Facility Inspection（餐饮相关 FACILITY TYPE）',
            api: 'https://data.houstontx.gov/api/3/action/datastore_search_sql',
            note: '门户检索见 https://data.houstontx.gov/dataset?q=business — 本导入使用健康部门食品设施检查登记（历史快照，日期待核对）',
          },
        ],
      },
    },
  });
}
