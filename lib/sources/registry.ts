/**
 * 数据源注册表 —— 全系统 metro/source 的单一真相来源
 *
 * 新增城市：
 *   1. 在 lib/sources/<city>.ts 写 adapter（实现 FoodDataSource）
 *   2. 在这里 import 并加入 SOURCE_REGISTRY 数组
 *   3. （可选）改 metro-config.ts 的 cities 白名单
 *
 * 不允许：硬编码 if (metro === 'xxx')。任何过滤/调度都要从 registry 查。
 */

import type { FoodDataSource, MetroArea } from './types';
import { sanFranciscoSource } from './san-francisco';
import { berkeleySource } from './berkeley';
import { houstonSource } from './houston';
import { houstonPermitEreportSource } from './houston-permit-ereport';
import { nycSource } from './nyc';
import { chicagoSource } from './chicago';
import { austinSource } from './austin';
import { seattleSource } from './seattle';
import { losAngelesSource } from './los-angeles';
import { bostonSource } from './boston';

export const SOURCE_REGISTRY: readonly FoodDataSource[] = [
  sanFranciscoSource,
  berkeleySource,
  houstonSource,
  houstonPermitEreportSource,
  nycSource, // enabled
  chicagoSource, // enabled
  austinSource, // enabled
  seattleSource, // enabled=false（待核实 resource id）
  losAngelesSource,
  bostonSource, // enabled=false（待核实 resource id）
];

/** 只拿启用的源（灰度开关） */
export function enabledSources(): readonly FoodDataSource[] {
  return SOURCE_REGISTRY.filter((s) => s.enabled);
}

export function sourcesForMetro(metro: MetroArea): readonly FoodDataSource[] {
  return SOURCE_REGISTRY.filter((s) => s.metro === metro && s.enabled);
}

export function getSourceById(id: string): FoodDataSource | undefined {
  return SOURCE_REGISTRY.find((s) => s.id === id);
}

/** 返回所有启用源的 id 集合；供 API 按 metro 过滤 leads 列表时用 */
export function sourceIdsForMetro(metro: MetroArea): string[] {
  return sourcesForMetro(metro).map((s) => s.id);
}

/** 当前已启用的 metro（用于 UI 下拉动态生成） */
export function enabledMetros(): MetroArea[] {
  const set = new Set<MetroArea>();
  for (const s of enabledSources()) set.add(s.metro);
  return Array.from(set);
}
