/**
 * Socrata Open Data API 共享 fetch 封装
 *
 * 约定：
 *   - $where / $limit / $order 以 query param 形式发送
 *   - 可选 X-App-Token 提高限流上限（env SOCRATA_APP_TOKEN）
 *   - 失败返回结构化 error 而非 throw；adapter 层决定是否再 throw
 */

import type { SourceFetchResult } from './types';

export interface SocrataFetchArgs {
  /** 完整 JSON 端点，如 'https://data.cityofnewyork.us/resource/43nn-pn8j.json' */
  endpoint: string;
  where?: string;
  limit?: number;
  order?: string;
  fetchImpl?: typeof fetch;
}

export interface SocrataFetchResult {
  ok: boolean;
  rows: Record<string, unknown>[];
  httpStatus?: number;
  error?: string;
}

export async function fetchSocrata(args: SocrataFetchArgs): Promise<SocrataFetchResult> {
  const fetchImpl = args.fetchImpl ?? globalThis.fetch;
  const params = new URLSearchParams();
  if (args.where) params.set('$where', args.where);
  if (args.limit) params.set('$limit', String(args.limit));
  if (args.order) params.set('$order', args.order);

  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = process.env.SOCRATA_APP_TOKEN;
  if (token) headers['X-App-Token'] = token;

  try {
    const res = await fetchImpl(`${args.endpoint}?${params.toString()}`, { headers });
    if (!res.ok) {
      return { ok: false, rows: [], httpStatus: res.status, error: `HTTP ${res.status}` };
    }
    const rows = (await res.json()) as Record<string, unknown>[];
    return { ok: true, rows: Array.isArray(rows) ? rows : [] };
  } catch (e) {
    return {
      ok: false,
      rows: [],
      error: e instanceof Error ? e.message : 'fetch failed',
    };
  }
}

export function toSourceFetchResult(
  id: string,
  label: string,
  res: SocrataFetchResult,
  fetched: number,
): SourceFetchResult {
  if (!res.ok) {
    return { id, label, ok: false, fetched: 0, error: res.error };
  }
  return { id, label, ok: true, fetched };
}
