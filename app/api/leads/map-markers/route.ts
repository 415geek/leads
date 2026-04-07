import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { extractLatLngFromSourceRaw } from '@/lib/geo-from-source-raw';
import type { LeadMapMarker } from '@/types/lead-map';
import type { LeadStatus } from '@/types/lead';

const MAX_ROWS = 800;

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select('id, name, address, city, lead_score, lead_status, source_raw')
      .order('lead_score', { ascending: false })
      .limit(MAX_ROWS);

    if (error) throw error;

    const rows = data ?? [];
    const markers: LeadMapMarker[] = [];
    let skippedNoCoords = 0;

    for (const row of rows) {
      const ll = extractLatLngFromSourceRaw(row.source_raw);
      if (!ll) {
        skippedNoCoords++;
        continue;
      }
      markers.push({
        id: row.id,
        name: row.name,
        address: row.address,
        city: row.city,
        lead_score: row.lead_score,
        lead_status: row.lead_status as LeadStatus,
        lat: ll.lat,
        lng: ll.lng,
      });
    }

    return NextResponse.json({
      markers,
      scanned: rows.length,
      skipped_no_coords: skippedNoCoords,
    });
  } catch (err) {
    console.error('[GET /api/leads/map-markers]', err);
    return NextResponse.json(
      { error: '获取地图数据失败' },
      { status: 500 }
    );
  }
}
