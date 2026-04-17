/** 销售区域 / 开放数据门户（与导入 source、筛选联动） */

export type LeadRegionId = 'bay_area' | 'houston';

/** 列表筛选：含「全部」以便跨区查看 */
export type LeadRegionFilterId = LeadRegionId | 'all';

export const LEADS_REGION_STORAGE_KEY = 'restaurant-leads-region';

export const REGION_OPTIONS: {
  id: LeadRegionId;
  label: string;
  shortLabel: string;
  openDataUrl: string;
  importHint: string;
}[] = [
  {
    id: 'bay_area',
    label: '旧金山湾区（DataSF / Berkeley）',
    shortLabel: '湾区',
    openDataUrl: 'https://data.sfgov.org/',
    importHint: '自动导入湾区餐饮登记（近 30 天等）',
  },
  {
    id: 'houston',
    label: '休斯顿（City of Houston Open Data）',
    shortLabel: '休斯顿',
    openDataUrl: 'https://data.houstontx.gov/dataset?q=business&sort=score+desc%2C+metadata_modified+desc',
    importHint:
      '自 HDHHS 食品服务设施检查登记拉取餐饮相关业态（门户为 CKAN API；数据集为历史快照，日期待在详情中核对）',
  },
];

export const HOUSTON_CITY_LABEL = 'Houston';

export function cityOptionsForRegion(region: LeadRegionFilterId) {
  if (region === 'houston') {
    return [
      { value: 'all', label: '休斯顿全市' },
      { value: HOUSTON_CITY_LABEL, label: HOUSTON_CITY_LABEL },
    ];
  }
  if (region === 'all') {
    return [
      { value: 'all', label: '全部城市' },
      { value: 'San Francisco', label: 'San Francisco' },
      { value: 'Oakland', label: 'Oakland' },
      { value: 'San Jose', label: 'San Jose' },
      { value: 'Fremont', label: 'Fremont' },
      { value: 'Berkeley', label: 'Berkeley' },
      { value: HOUSTON_CITY_LABEL, label: HOUSTON_CITY_LABEL },
    ];
  }
  return [
    { value: 'all', label: '全部城市' },
    { value: 'San Francisco', label: 'San Francisco' },
    { value: 'Oakland', label: 'Oakland' },
    { value: 'San Jose', label: 'San Jose' },
    { value: 'Fremont', label: 'Fremont' },
    { value: 'Berkeley', label: 'Berkeley' },
  ];
}
