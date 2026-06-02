import { NextResponse } from 'next/server';
import { listMapMarkers } from '@/lib/leads/query-leads';

export async function GET() {
  try {
    const result = await listMapMarkers();

    return NextResponse.json(result);
  } catch (err) {
    console.error('[GET /api/leads/map-markers]', err);
    return NextResponse.json(
      { error: '获取地图数据失败' },
      { status: 500 }
    );
  }
}
