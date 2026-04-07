import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { calculateLeadScore } from '@/lib/scoring';

const SF_DATA_API = 'https://data.sfgov.org/resource/g8m3-pdis.json';

/** 最近 N 天内新登记的经营场所 */
const LOOKBACK_DAYS = 30;
/** Socrata 单次拉取上限 */
const FETCH_LIMIT = 500;

interface SFBusinessRecord {
  business_name?: string;
  dba_name?: string;
  full_business_address?: string;
  business_phone?: string;
  naic_code?: string;
  naic_code_description?: string;
  lic_code_description?: string;
  dba_start_date?: string;
  location_start_date?: string;
  city?: string;
}

function isChinese(text: string): boolean {
  const chineseKeywords = [
    'chinese', 'china', 'asian', 'dim sum', 'dumpling', 'noodle', 'wok',
    'szechuan', 'sichuan', 'cantonese', 'mandarin', 'hunan', 'shanghai',
    '中餐', '中国', '粤菜', '川菜', '湘菜', '东北', '饺子', '面', '烧烤',
    'taiwan', 'taiwanese', 'hong kong', 'beijing', 'peking',
  ];
  const lowerText = text.toLowerCase();
  return chineseKeywords.some((keyword) => lowerText.includes(keyword));
}

/** 能识别则标中餐细分；否则用 NAICS / 执照类型作为「业态」说明（所有餐饮类都会入库） */
function buildCuisineLabel(record: SFBusinessRecord): string {
  const desc = `${record.naic_code_description || ''} ${record.lic_code_description || ''}`;
  const name = `${record.business_name || ''} ${record.dba_name || ''}`;

  if (isChinese(desc) || isChinese(name)) {
    const d = desc.toLowerCase();
    if (d.includes('szechuan') || d.includes('sichuan')) return '川菜';
    if (d.includes('cantonese')) return '粤菜';
    if (d.includes('hunan')) return '湘菜';
    if (d.includes('taiwan')) return '台湾菜';
    if (name.includes('饺子') || d.includes('dumpling')) return '东北菜';
    return '中餐';
  }

  const naics = record.naic_code_description?.trim();
  if (naics) return naics.length > 120 ? `${naics.slice(0, 117)}…` : naics;

  const lic = record.lic_code_description?.trim();
  if (lic) return lic.length > 120 ? `${lic.slice(0, 117)}…` : lic;

  return '餐饮';
}

function buildFoodServiceWhereClause(sinceDate: string): string {
  const food =
    `naic_code like '722%' ` +
    `OR naic_code_description like '%Food Service%' ` +
    `OR naic_code_description like '%Restaurant%' ` +
    `OR naic_code_description like '%Drinking%' ` +
    `OR naic_code_description like '%Cater%' ` +
    `OR lic_code_description like '%RESTAURANT%' ` +
    `OR lic_code_description like '%TAVERN%' ` +
    `OR lic_code_description like '%FOOD PREP%' ` +
    `OR lic_code_description like '%MOBILE FOOD%' ` +
    `OR lic_code_description like '%CATER%' ` +
    `OR lic_code_description like '%CAFETERIA%' ` +
    `OR lic_code_description like '%SHARED KITCHEN%' ` +
    `OR lic_code_description like '%BAKERY%' ` +
    `OR lic_code_description like '%CAFE%' ` +
    `OR lic_code_description like '%EATING PLACE%' ` +
    `OR lic_code_description like '%DINING%'`;

  return (
    `city = 'San Francisco' ` +
    `AND location_start_date >= '${sinceDate}' ` +
    `AND (${food})`
  );
}

export async function POST() {
  try {
    const since = new Date();
    since.setDate(since.getDate() - LOOKBACK_DAYS);
    const dateFilter = since.toISOString().split('T')[0];

    const params = new URLSearchParams({
      $where: buildFoodServiceWhereClause(dateFilter),
      $limit: String(FETCH_LIMIT),
      $order: 'location_start_date DESC',
    });

    const response = await fetch(`${SF_DATA_API}?${params}`, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`SF Data API error: ${response.status}`);
    }

    const records: SFBusinessRecord[] = await response.json();

    const leadsToInsert = records
      .filter((record) => {
        const name = record.business_name || record.dba_name;
        return name && name.length > 1;
      })
      .map((record) => {
        const name = record.dba_name || record.business_name || 'Unknown';
        const cuisineType = buildCuisineLabel(record);
        const licenseDate = record.location_start_date || record.dba_start_date;

        const lead = {
          name,
          address: record.full_business_address || null,
          phone: record.business_phone || null,
          cuisine_type: cuisineType,
          city: 'San Francisco',
          source: 'sf_gov',
          license_date: licenseDate ? licenseDate.split('T')[0] : null,
          lead_status: 'new' as const,
        };

        return {
          ...lead,
          lead_score: calculateLeadScore(lead),
        };
      });

    if (leadsToInsert.length === 0) {
      return NextResponse.json({
        success: true,
        message: '没有找到新的餐饮类执照数据',
        imported: 0,
        total: 0,
        chineseTagged: 0,
      });
    }

    const { data, error } = await supabaseAdmin
      .from('leads')
      .upsert(leadsToInsert, {
        onConflict: 'name,address',
        ignoreDuplicates: true,
      })
      .select();

    if (error) {
      console.error('Supabase upsert error:', error);
      throw new Error(`Database error: ${error.message}`);
    }

    const chineseTagged = leadsToInsert.filter((l) =>
      ['中餐', '川菜', '粤菜', '湘菜', '台湾菜', '东北菜'].includes(l.cuisine_type || ''),
    ).length;

    return NextResponse.json({
      success: true,
      message: `成功导入 ${data?.length ?? 0} 条新餐饮类 leads`,
      imported: data?.length ?? 0,
      total: leadsToInsert.length,
      chineseTagged,
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
    message: 'Use POST to import leads from SF.gov',
    source: 'San Francisco Open Data — Business Registration',
    filters: `San Francisco, new location in last ${LOOKBACK_DAYS} days, food service / restaurant / bar / caterer / bakery / cafe (NAICS 722* or matching license types)`,
  });
}
