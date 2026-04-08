import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  LOOKBACK_DAYS,
  countChineseTagged,
  runBayAreaFoodImport,
} from '@/lib/bay-area-food-import';

export async function POST() {
  try {
    const { sinceDate, sourceResults, leads } = await runBayAreaFoodImport();

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
    message: 'Use POST to import food-service leads from Bay Area open data portals',
    lookbackDaysSf: LOOKBACK_DAYS,
    sources: [
      {
        id: 'sf_gov',
        city: 'Bay Area（DataSF，实地城市）',
        kind: 'new_business_location',
        dataset: 'https://data.sfgov.org/resource/g8m3-pdis.json',
        note: `近 ${LOOKBACK_DAYS} 天 location_start_date；state=CA 且 city 为湾区白名单（九县及周边常见市）；餐饮 NAICS/执照筛选；lead.city 取记录 city`,
      },
      {
        id: 'berkeley_open_data',
        city: 'Berkeley',
        kind: 'active_license_snapshot',
        dataset: 'https://data.cityofberkeley.info/resource/rwnf-bu3w.json',
        note: '无登记日期列；导入为当前有效餐饮相关执照，license_date 为空，评分偏「覆盖」而非「时效」',
      },
      {
        id: 'planned',
        city: 'Oakland 门户 / San José CKAN / …',
        kind: 'optional_extra',
        note: '与 g8m3 重叠度低的市专属源可再接入；Oakland 需对标数据集；San José 为 CKAN API',
      },
    ],
  });
}
