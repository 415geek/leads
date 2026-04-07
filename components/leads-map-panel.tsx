'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { LeadMapMarker } from '@/types/lead-map';

const SF_CENTER: [number, number] = [37.7749, -122.4194];
const DEFAULT_ZOOM = 12;

function scoreStroke(score: number): string {
  if (score >= 80) return '#15803d';
  if (score >= 50) return '#a16207';
  return '#475569';
}

function scoreFill(score: number): string {
  if (score >= 80) return '#22c55e';
  if (score >= 50) return '#eab308';
  return '#94a3b8';
}

function FitBounds({ markers }: { markers: LeadMapMarker[] }) {
  const map = useMap();
  useEffect(() => {
    if (markers.length === 0) {
      map.setView(SF_CENTER, DEFAULT_ZOOM);
      return;
    }
    const latlngs = markers.map((m) => L.latLng(m.lat, m.lng));
    const b = L.latLngBounds(latlngs);
    map.fitBounds(b, { padding: [48, 48], maxZoom: 16 });
  }, [map, markers]);
  return null;
}

export function LeadsMapPanel() {
  const [markers, setMarkers] = useState<LeadMapMarker[]>([]);
  const [scanned, setScanned] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/leads/map-markers');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '加载失败');
      setMarkers(json.markers ?? []);
      setScanned(json.scanned ?? 0);
      setSkipped(json.skipped_no_coords ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setMarkers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const center: [number, number] = useMemo(() => {
    if (markers.length === 0) return SF_CENTER;
    const lat = markers.reduce((s, m) => s + m.lat, 0) / markers.length;
    const lng = markers.reduce((s, m) => s + m.lng, 0) / markers.length;
    return [lat, lng];
  }, [markers]);

  return (
    <Card className="border-[#1e3a5f]/20 overflow-hidden">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-lg text-[#1e3a5f]">Leads 地图</CardTitle>
          <p className="text-sm font-normal text-muted-foreground mt-1">
            显示带有地理坐标（主要来自 SF 开放数据 <code className="text-xs bg-slate-100 px-1 rounded">source_raw.location</code>）的
            leads。最多加载 800 条高分记录。
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => load()} disabled={loading}>
          {loading ? '刷新中…' : '刷新'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          已扫描 {scanned} 条 · 图上 {markers.length} 条 · 无坐标跳过 {skipped} 条
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && markers.length === 0 && !error && (
          <p className="text-sm text-muted-foreground py-4">
            当前没有可标点的数据。请使用「自动导入 SF 餐饮新登记」拉取含 GeoJSON 坐标的记录，或确保{' '}
            <code className="text-xs bg-slate-100 px-1 rounded">source_raw</code> 中含 Point 类型{' '}
            <code className="text-xs bg-slate-100 px-1 rounded">location</code>。
          </p>
        )}
        <div className="relative h-[min(420px,55vh)] w-full rounded-lg border border-slate-200 z-0">
          <MapContainer
            center={center}
            zoom={DEFAULT_ZOOM}
            className="h-full w-full rounded-lg z-0 [&_.leaflet-tile-pane]:opacity-90"
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds markers={markers} />
            {markers.map((m) => (
              <CircleMarker
                key={m.id}
                center={[m.lat, m.lng]}
                radius={6 + Math.min(8, Math.floor(m.lead_score / 15))}
                pathOptions={{
                  color: scoreStroke(m.lead_score),
                  fillColor: scoreFill(m.lead_score),
                  fillOpacity: 0.85,
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="min-w-[200px] text-sm">
                    <div className="font-semibold text-slate-900">{m.name}</div>
                    <div className="text-xs text-slate-600 mt-1">
                      评分 {m.lead_score} · {m.lead_status}
                    </div>
                    {m.address ? (
                      <div className="text-xs text-slate-500 mt-1">{m.address}</div>
                    ) : null}
                    <a
                      href={`/leads/${m.id}`}
                      className="inline-block mt-2 text-xs font-medium text-[#1e3a5f] underline"
                    >
                      打开详情 →
                    </a>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      </CardContent>
    </Card>
  );
}
