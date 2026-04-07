/**
 * 从 lead.source_raw（如 SF Open Data Socrata 行）解析 WGS84 坐标。
 */

export interface LatLng {
  lat: number;
  lng: number;
}

function isFiniteNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * 支持：
 * - GeoJSON Point: location: { type: 'Point', coordinates: [lng, lat] }
 * - 部分数据集的 latitude / longitude 或 lat / lng 数字字段
 */
export function extractLatLngFromSourceRaw(raw: unknown): LatLng | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  const location = o.location ?? o.business_location;
  if (location && typeof location === 'object' && location !== null) {
    const loc = location as Record<string, unknown>;
    if (loc.type === 'Point' && Array.isArray(loc.coordinates)) {
      const c = loc.coordinates as unknown[];
      const lng = Number(c[0]);
      const lat = Number(c[1]);
      if (isFiniteNum(lat) && isFiniteNum(lng)) {
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { lat, lng };
        }
      }
    }
  }

  const lat = o.latitude ?? o.lat;
  const lng = o.longitude ?? o.lng;
  if (isFiniteNum(lat) && isFiniteNum(lng)) {
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  return null;
}
