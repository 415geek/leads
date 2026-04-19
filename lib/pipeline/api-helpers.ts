/**
 * HTTP 层共享 helper（供 /api/leads/import、/api/leads/upsert、/api/cron/ingest-all 使用）
 *
 * 与具体 request/response 无关，便于单元测试。
 */

import type { MetroArea } from '@/lib/sources/types';

export const CHINESE_TAGS: readonly string[] = ['中餐', '川菜', '粤菜', '湘菜', '台湾菜', '东北菜'];

/**
 * 解析请求 body 中的 metro / region 字段
 * —— 支持新字段 `metro` 和向后兼容旧字段 `region`
 * —— 只接受当前 registry 启用的 metro id
 */
export function parseMetroInput(
  body: unknown,
  enabled: readonly MetroArea[],
): MetroArea | null {
  if (!body || typeof body !== 'object') return null;
  const raw =
    (body as { metro?: string; region?: string }).metro ??
    (body as { metro?: string; region?: string }).region;
  if (!raw) return null;
  return enabled.includes(raw as MetroArea) ? (raw as MetroArea) : null;
}

/**
 * 决定 /api/leads/import 该跑哪种模式
 *
 *   sourceId 优先 → 单源精确执行（前端循环用）
 *   metro=='all' → 返回 sourceIds 列表，不执行（交给前端循环）
 *   metro=<id>   → 跑该 metro 的所有源
 *   兜底         → 跑 'sf_bay'
 *
 * 返回：
 *   { mode: 'single',  sourceIds: [id] }   执行单源
 *   { mode: 'metro',   sourceIds: [...] }  执行该 metro 全部源
 *   { mode: 'list',    sourceIds: [...] }  仅返回列表给前端
 *   { mode: 'invalid', reason }            无效输入
 */
export type ImportMode = 'single' | 'metro' | 'list' | 'invalid';

export interface ImportDecision {
  mode: ImportMode;
  sourceIds: string[];
  metroLabel: string;
  reason?: string;
}

export function decideImportMode(
  body: unknown,
  helpers: {
    enabledMetros: () => readonly MetroArea[];
    sourcesForMetro: (m: MetroArea) => readonly { id: string }[];
    enabledSourceIds: () => string[];
    sourceExists: (id: string) => boolean;
  },
): ImportDecision {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const sourceId = typeof raw.sourceId === 'string' ? raw.sourceId : undefined;
  const metroRaw =
    typeof raw.metro === 'string'
      ? raw.metro
      : typeof raw.region === 'string'
        ? raw.region
        : undefined;

  if (sourceId) {
    if (!helpers.sourceExists(sourceId)) {
      return {
        mode: 'invalid',
        sourceIds: [],
        metroLabel: 'unknown',
        reason: `unknown sourceId: ${sourceId}`,
      };
    }
    return { mode: 'single', sourceIds: [sourceId], metroLabel: sourceId };
  }

  if (metroRaw === 'all') {
    return {
      mode: 'list',
      sourceIds: helpers.enabledSourceIds(),
      metroLabel: 'all',
    };
  }

  const enabled = helpers.enabledMetros();
  const metro =
    metroRaw && enabled.includes(metroRaw as MetroArea)
      ? (metroRaw as MetroArea)
      : ('sf_bay' as MetroArea);
  const ids = helpers.sourcesForMetro(metro).map((s) => s.id);
  return { mode: 'metro', sourceIds: ids, metroLabel: metro };
}
