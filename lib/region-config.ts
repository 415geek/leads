/**
 * 区域/城市配置 —— 现在从 lib/sources/registry + metro-config 动态生成
 *
 * 向后兼容：
 *   - 保留 LeadRegionId 类型，但底层实际上就是 MetroArea
 *   - 保留 REGION_OPTIONS / cityOptionsForRegion 导出供现有 UI / API 调用
 *   - 新代码请直接用 lib/sources/registry + lib/sources/metro-config
 */

import { METRO_CONFIGS } from '@/lib/sources/metro-config';
import { enabledMetros, sourceIdsForMetro } from '@/lib/sources/registry';
import type { MetroArea } from '@/lib/sources/types';

/** 向后兼容别名 */
export type LeadRegionId = MetroArea;
export type LeadRegionFilterId = LeadRegionId | 'all';

export const LEADS_REGION_STORAGE_KEY = 'restaurant-leads-region';

/** 用于 UI 下拉：仅展示当前 registry 中 enabled 的 metro */
export const REGION_OPTIONS: {
  id: LeadRegionId;
  label: string;
  shortLabel: string;
  openDataUrl: string;
  importHint: string;
}[] = (() => {
  const active = new Set(enabledMetros());
  return METRO_CONFIGS.filter((m) => active.has(m.id)).map((m) => ({
    id: m.id,
    label: m.label,
    shortLabel: m.shortLabel,
    openDataUrl: m.openDataUrl,
    importHint: `自动从 ${m.label} 相关开放数据导入餐饮登记/检查`,
  }));
})();

/** 兼容旧 UI：Houston 列表只显示 Houston；"全部地区"汇总所有启用 metro 的城市 */
export function cityOptionsForRegion(region: LeadRegionFilterId) {
  if (region === 'all') {
    const active = new Set(enabledMetros());
    const cities = Array.from(
      new Set(METRO_CONFIGS.filter((m) => active.has(m.id)).flatMap((m) => m.cities)),
    );
    return [
      { value: 'all', label: '全部城市' },
      ...cities.map((c) => ({ value: c, label: c })),
    ];
  }
  const cfg = METRO_CONFIGS.find((m) => m.id === region);
  if (!cfg) return [{ value: 'all', label: '全部城市' }];
  return [
    { value: 'all', label: `${cfg.shortLabel}全部城市` },
    ...cfg.cities.map((c) => ({ value: c, label: c })),
  ];
}

/** 给 API 过滤用：某 metro 下对应的 source id 列表 */
export function sourceIdsForRegion(region: LeadRegionFilterId): string[] | null {
  if (region === 'all') return null;
  return sourceIdsForMetro(region);
}
