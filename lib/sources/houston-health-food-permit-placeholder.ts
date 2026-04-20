/**
 * Houston Health Department — Food Establishment Permit（食品经营许可）
 *
 * 市开放数据门户（data.houstontx.gov）目前仅有检查类数据集，无「新许可申请/批准」公开 datastore。
 * 预留 registry 条目：对接卫生局许可门户、采购数据或 n8n 后，可将本文件改为实装并启用。
 *
 * 规格参考：pending → 即将开业；approved → 即将开业（高优先级）；输出 source = Food Permit。
 */

import type { FoodDataSource, NormalizedDraft, SourceFetchResult } from './types';

const SOURCE_ID = 'houston_health_food_permit';

export const houstonHealthFoodPermitPlaceholderSource: FoodDataSource = {
  id: SOURCE_ID,
  label:
    'Houston Health · Food Establishment Permit（占位：无公开 CKAN；待接许可系统或 JSON 补充）',
  metro: 'houston',
  state: 'TX',
  kind: 'permit',
  portalUrl: 'https://www.houstontx.gov/health/',
  rateLimit: { rps: 1 },
  enabled: false,

  async fetchAndNormalize() {
    const result: SourceFetchResult = {
      id: SOURCE_ID,
      label: houstonHealthFoodPermitPlaceholderSource.label,
      ok: true,
      fetched: 0,
    };
    return { result, drafts: [] as NormalizedDraft[] };
  },
};
