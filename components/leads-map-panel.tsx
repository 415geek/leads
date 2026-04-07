'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { LeadMapMarker } from '@/types/lead-map';

const SF_CENTER: [number, number] = [37.7749, -122.4194];
const DEFAULT_ZOOM = 12;

function formatMapDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('zh-CN', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatMapAddress(m: LeadMapMarker): string {
  const a = m.address?.trim();
  const c = m.city?.trim();
  if (a && c && !a.toLowerCase().includes(c.toLowerCase().slice(0, 4))) {
    return `${a}, ${c}`;
  }
  if (a) return a;
  if (c) return c;
  return '—';
}

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
  const router = useRouter();
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

  const goToLead = useCallback(
    (id: string) => {
      router.push(`/leads/${id}`);
    },
    [router]
  );

  return (
    <Card className="border-[#1e3a5f]/20 overflow-hidden">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-lg text-[#1e3a5f]">Leads 地图</CardTitle>
          <p className="text-sm font-normal text-muted-foreground mt-1">
            标点对应数据库中的地址坐标（<code className="text-xs bg-slate-100 px-1 rounded">source_raw.location</code>）。
            <strong className="font-medium text-slate-700"> 悬停</strong>圆点可预览店名、登记日期与地址；<strong className="font-medium text-slate-700">点击</strong>
            圆点进入该 Lead 详情页。
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
        <div className="leads-map-panel relative h-[min(420px,55vh)] w-full rounded-lg border border-slate-200 z-0">
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
                eventHandlers={{
                  click: () => goToLead(m.id),
                }}
              >
                <Tooltip
                  direction="top"
                  offset={[0, -6]}
                  opacity={1}
                  sticky
                  className="!rounded-lg !border !border-slate-200 !bg-white !p-0 !shadow-md [&_.leaflet-tooltip-content]:!m-0"
                >
                  <div className="max-w-[260px] px-3 py-2 text-left text-slate-900">
                    <div className="font-semibold text-sm leading-snug">{m.name}</div>
                    <div className="mt-1.5 space-y-0.5 text-xs text-slate-600">
                      <div>
                        <span className="text-slate-400">登记/执照日期：</span>
                        {formatMapDate(m.license_date)}
                      </div>
                      <div className="break-words">
                        <span className="text-slate-400">地址：</span>
                        {formatMapAddress(m)}
                      </div>
                    </div>
                    <div className="mt-2 border-t border-slate-100 pt-1.5 text-[11px] text-[#1e3a5f]">
                      点击查看详情
                    </div>
                  </div>
                </Tooltip>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      </CardContent>
    </Card>
  );
}
