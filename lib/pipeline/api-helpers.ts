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
