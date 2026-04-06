import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { calculateLeadScore } from '@/lib/scoring';

const SF_DATA_API = 'https://data.sfgov.org/resource/g8m3-pdis.json';

interface SFBusinessRecord {
  business_name?: string;
  dba_name?: string;
  full_business_address?: string;
  business_phone?: string;
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
    'taiwan', 'taiwanese', 'hong kong', 'beijing', 'peking'
  ];
  const lowerText = text.toLowerCase();
  return chineseKeywords.some(keyword => lowerText.includes(keyword));
}

function extractCuisineType(record: SFBusinessRecord): string | null {
  const desc = record.naic_code_description || record.lic_code_description || '';
  const name = record.business_name || record.dba_name || '';
  
  if (isChinese(desc) || isChinese(name)) {
    if (desc.toLowerCase().includes('szechuan') || desc.toLowerCase().includes('sichuan')) return '川菜';
    if (desc.toLowerCase().includes('cantonese')) return '粤菜';
    if (desc.toLowerCase().includes('hunan')) return '湘菜';
    if (desc.toLowerCase().includes('taiwan')) return '台湾菜';
    if (name.includes('饺子') || desc.toLowerCase().includes('dumpling')) return '东北菜';
    return '中餐';
  }
  
  return null;
}

export async function POST() {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateFilter = thirtyDaysAgo.toISOString().split('T')[0];

    const params = new URLSearchParams({
      '$where': `location_start_date >= '${dateFilter}' AND naic_code_description LIKE '%Restaurant%'`,
      '$limit': '100',
      '$order': 'location_start_date DESC'
    });

    const response = await fetch(`${SF_DATA_API}?${params}`, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`SF Data API error: ${response.status}`);
    }

    const records: SFBusinessRecord[] = await response.json();
    
    const leadsToInsert = records
      .filter(record => {
        const name = record.business_name || record.dba_name;
        return name && name.length > 1;
      })
      .map(record => {
        const name = record.dba_name || record.business_name || 'Unknown';
        const cuisineType = extractCuisineType(record);
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
        message: '没有找到新的餐厅执照数据',
        imported: 0,
        total: 0,
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

    const chineseLeads = leadsToInsert.filter(l => l.cuisine_type !== null);

    return NextResponse.json({
      success: true,
      message: `成功导入 ${data?.length || 0} 条新 leads`,
      imported: data?.length || 0,
      total: leadsToInsert.length,
      chineseRestaurants: chineseLeads.length,
    });

  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Import failed' 
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Use POST to import leads from SF.gov',
    source: 'San Francisco Open Data - Business Licenses',
    filters: 'New restaurants in last 30 days',
  });
}
