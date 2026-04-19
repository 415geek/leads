/**
 * 把 PipelineLead[] 写入 Supabase leads 表，支持 schema migration 未执行时自动降级。
 *
 * 行为：
 *   1. 分两段：(source, external_id) 有值的走 upsert；无 external_id 的按 (name, address, city) 软去重逐条 insert
 *   2. 默认 onConflict='source,external_id'，ignoreDuplicates=true（不覆盖用户手工改的 lead_status / notes）
 *   3. 若 Supabase 返回 "column does not exist" 类错误：自动降级为**只写老列**重试一次
 *      （老列 = migration 之前就有的列，见 supabase/schema.sql 顶部 leads 表定义）
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PipelineLead } from './run';

export interface WriteLeadsResult {
  imported: number;
  /** 写入是否走了降级分支（缺新列 → 退回老列） */
  degraded: boolean;
  /** 出现 schema 错误时的人类可读提示 */
  schemaHint?: string;
  /** 未分类的单行 insert 失败数（不视为整体失败） */
  singleInsertFailures: number;
}

const LEGACY_COLUMNS = [
  'name',
  'address',
  'phone',
  'cuisine_type',
  'city',
  'source',
  'license_date',
  'license_type',
  'source_raw',
  'lead_status',
  'lead_score',
] as const;

type LegacyRow = {
  name: string;
  address: string | null;
  phone: string | null;
  cuisine_type: string;
  city: string;
  source: string;
  license_date: string | null;
  license_type: string | null;
  source_raw: unknown;
  lead_status: string;
  lead_score: number;
};

type FullRow = LegacyRow & {
  metro_area: string;
  external_id: string | null;
  first_inspection_date: string | null;
  is_restaurant_confidence: number | null;
  ai_classification: unknown;
};

function toFullRow(d: PipelineLead): FullRow {
  return {
    name: d.name,
    address: d.address,
    phone: d.phone,
    cuisine_type: d.cuisine_type,
    city: d.city,
    metro_area: d.metro_area,
    source: d.source,
    external_id: d.external_id,
    license_date: d.license_date,
    first_inspection_date: d.first_inspection_date,
    license_type: d.license_type,
    source_raw: d.source_raw,
    lead_status: d.lead_status,
    lead_score: d.lead_score,
    is_restaurant_confidence: d.is_restaurant_confidence,
    ai_classification: d.ai_classification,
  };
}

function toLegacyRow(full: FullRow): LegacyRow {
  const legacy: Partial<FullRow> = {};
  for (const k of LEGACY_COLUMNS) {
    (legacy as Record<string, unknown>)[k] = (full as Record<string, unknown>)[k];
  }
  return legacy as LegacyRow;
}

/** 识别 Postgres "column does not exist" 错误 */
function isMissingColumnError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === '42703') return true;
  const m = (err.message ?? '').toLowerCase();
  return /column .* does not exist/.test(m) || /could not find the '.*' column/.test(m);
}

/**
 * 写入 leads 表；缺列时自动降级。
 */
export async function writePipelineLeads(
  supabase: SupabaseClient,
  leads: readonly PipelineLead[],
): Promise<WriteLeadsResult> {
  if (leads.length === 0) {
    return { imported: 0, degraded: false, singleInsertFailures: 0 };
  }

  const rows = leads.map(toFullRow);
  const withExt = rows.filter((r) => !!r.external_id);
  const withoutExt = rows.filter((r) => !r.external_id);

  let imported = 0;
  let degraded = false;
  let singleInsertFailures = 0;
  let schemaHint: string | undefined;

  if (withExt.length > 0) {
    // 第一次尝试：写完整列
    const { data, error } = await supabase
      .from('leads')
      .upsert(withExt, { onConflict: 'source,external_id', ignoreDuplicates: true })
      .select('id');

    if (error && isMissingColumnError(error)) {
      // 降级：写老列 + 按 (name, address, city) 逐条去重（因为老 schema 没有 (source, external_id) unique）
      degraded = true;
      schemaHint =
        'Supabase schema migration 未执行。已降级为只写老列；跑 supabase/schema.sql 后可用完整字段（external_id, metro_area, first_inspection_date, is_restaurant_confidence, ai_classification）。';
      for (const full of withExt) {
        const legacy = toLegacyRow(full);
        const inserted = await insertIfNotExists(supabase, legacy);
        if (inserted) imported += 1;
        else singleInsertFailures += 0; // 已存在 ≠ failure
      }
    } else if (error) {
      // 非 schema 错误：真·失败，抛给调用方处理
      throw new Error(`upsert(withExt) failed: ${error.message}`);
    } else {
      imported += data?.length ?? 0;
    }
  }

  for (const full of withoutExt) {
    const legacy = toLegacyRow(full);
    const inserted = await insertIfNotExists(supabase, legacy);
    if (inserted) {
      imported += 1;
    } else if (inserted === null) {
      // insert 真正失败（非"已存在"）
      singleInsertFailures += 1;
    }
  }

  return { imported, degraded, schemaHint, singleInsertFailures };
}

/**
 * 判断 (name, city, address) 是否已存在；不存在则 insert
 * 返回：
 *   true  —— 本次新增成功
 *   false —— 已存在，跳过
 *   null  —— insert 真实失败
 */
async function insertIfNotExists(
  supabase: SupabaseClient,
  row: LegacyRow,
): Promise<boolean | null> {
  const { data: exists } = await supabase
    .from('leads')
    .select('id')
    .eq('name', row.name)
    .eq('city', row.city)
    .ilike('address', row.address ?? '')
    .maybeSingle();
  if (exists) return false;

  const { data, error } = await supabase.from('leads').insert(row).select('id');
  if (error) {
    // 列缺失再尝试老列（应该不会到这里因为 row 已经是老列了，但防御）
    console.warn('[write-leads] insert failed:', row.name, error.message);
    return null;
  }
  return (data?.length ?? 0) > 0;
}
