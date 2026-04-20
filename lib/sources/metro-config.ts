/**
 * 都会区 → 城市白名单（UI 二级过滤用）
 *
 * metro_area 是主过滤键（存 leads.metro_area 列）；city 白名单只影响 UI 下拉可选项。
 * Phase 3 启用更多 metro 时，只改这个文件。
 */

import type { MetroArea, MetroConfig } from './types';

export const METRO_CONFIGS: readonly MetroConfig[] = [
  {
    id: 'la',
    label: '洛杉矶（LA County EH · 默认仅新设施首次检查窗口 · ArcGIS）',
    shortLabel: '洛杉矶',
    cities: ['Los Angeles', 'Long Beach', 'Pasadena', 'Santa Monica', 'Glendale'],
    openDataUrl: 'https://lacounty.gov/',
  },
  {
    id: 'sf_bay',
    label: '旧金山湾区（DataSF / Berkeley）',
    shortLabel: '湾区',
    cities: [
      'San Francisco',
      'Oakland',
      'San Jose',
      'Fremont',
      'Berkeley',
      'Palo Alto',
      'Mountain View',
      'Daly City',
      'Sunnyvale',
      'Santa Clara',
    ],
    openDataUrl: 'https://data.sfgov.org/',
  },
  {
    id: 'nyc',
    label: '纽约（DOHMH Restaurant Inspections）',
    shortLabel: '纽约',
    cities: ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'],
    openDataUrl: 'https://data.cityofnewyork.us/',
  },
  {
    id: 'chicago',
    label: '芝加哥（Chicago Food Inspections）',
    shortLabel: '芝加哥',
    cities: ['Chicago'],
    openDataUrl: 'https://data.cityofchicago.org/',
  },
  {
    id: 'houston',
    label:
      '休斯顿（HDHHS 检查 + 规划局 eReport + Harris DBA/TX SOS 可选 JSON 补充）',
    shortLabel: '休斯顿',
    cities: ['Houston'],
    openDataUrl: 'https://data.houstontx.gov/',
  },
  {
    id: 'seattle',
    label: '西雅图（King County Food Establishment）',
    shortLabel: '西雅图',
    cities: ['Seattle', 'Bellevue', 'Redmond', 'Kirkland'],
    openDataUrl: 'https://data.kingcounty.gov/',
  },
  {
    id: 'austin',
    label: '奥斯汀（Austin Restaurant Inspection Scores）',
    shortLabel: '奥斯汀',
    cities: ['Austin'],
    openDataUrl: 'https://data.austintexas.gov/',
  },
  {
    id: 'boston',
    label: '波士顿（Boston Food Establishment Inspections）',
    shortLabel: '波士顿',
    cities: ['Boston', 'Cambridge', 'Somerville'],
    openDataUrl: 'https://data.boston.gov/',
  },
] as const;

export function getMetroConfig(metro: MetroArea): MetroConfig {
  const cfg = METRO_CONFIGS.find((m) => m.id === metro);
  if (!cfg) throw new Error(`Unknown metro: ${metro}`);
  return cfg;
}

export function listMetros(): readonly MetroArea[] {
  return METRO_CONFIGS.map((m) => m.id);
}
