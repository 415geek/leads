/**
 * Schema Migration 幂等性静态检查
 *
 * 不连真实数据库（CI 环境不保证 Postgres 可用），而是做 SQL 文本静态分析：
 *   - 所有 `alter table ... add column` 必须带 `if not exists`
 *   - 所有 `create table` / `create index` 必须带 `if not exists`
 *   - 所有 `drop constraint` 必须带 `if exists`
 *
 * 这保证 migration 可在已有生产库重复执行不爆错。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SCHEMA_PATH = resolve(__dirname, '..', 'supabase', 'schema.sql');
const sql = readFileSync(SCHEMA_PATH, 'utf-8').toLowerCase();

// 把语句按分号拆，忽略注释
function statements(text: string): string[] {
  return text
    .split(/;\s*(?:--[^\n]*\n)?/)
    .map((s) =>
      s
        .split('\n')
        .map((l) => l.replace(/--.*$/, ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((s) => s.length > 0);
}

const stmts = statements(sql);

describe('supabase/schema.sql is idempotent', () => {
  it('ALL alter table ... add column statements use IF NOT EXISTS', () => {
    const addCols = stmts.filter((s) => /alter table .* add column/.test(s));
    expect(addCols.length).toBeGreaterThan(0);
    for (const s of addCols) {
      expect(s, `stmt: ${s}`).toMatch(/add column if not exists/);
    }
  });

  it('ALL create table statements use IF NOT EXISTS', () => {
    const createTables = stmts.filter((s) => /^create table /.test(s));
    expect(createTables.length).toBeGreaterThan(0);
    for (const s of createTables) {
      expect(s, `stmt: ${s}`).toMatch(/^create table if not exists/);
    }
  });

  it('ALL create index statements use IF NOT EXISTS', () => {
    const createIdx = stmts.filter((s) => /^create (unique )?index /.test(s));
    expect(createIdx.length).toBeGreaterThan(0);
    for (const s of createIdx) {
      expect(s, `stmt: ${s}`).toMatch(/^create (unique )?index if not exists/);
    }
  });

  it('ALL alter table ... drop constraint statements use IF EXISTS', () => {
    const dropCons = stmts.filter((s) => /alter table .* drop constraint/.test(s));
    // 至少一条：我们确实 drop 了老的 (name,address) 约束
    expect(dropCons.length).toBeGreaterThan(0);
    for (const s of dropCons) {
      expect(s, `stmt: ${s}`).toMatch(/drop constraint if exists/);
    }
  });

  it('V1 migration adds the critical new columns', () => {
    expect(sql).toMatch(/add column if not exists external_id/);
    expect(sql).toMatch(/add column if not exists metro_area/);
    expect(sql).toMatch(/add column if not exists first_seen_at/);
    expect(sql).toMatch(/add column if not exists first_inspection_date/);
    expect(sql).toMatch(/add column if not exists is_restaurant_confidence/);
    expect(sql).toMatch(/add column if not exists ai_classification/);
  });

  it('V1 migration creates lead_enrichment and lead_classification_log tables', () => {
    expect(sql).toMatch(/create table if not exists lead_enrichment/);
    expect(sql).toMatch(/create table if not exists lead_classification_log/);
  });

  it('V1 migration adds (source, external_id) unique index', () => {
    expect(sql).toMatch(/create unique index if not exists idx_leads_source_external/);
    expect(sql).toMatch(/on leads \(source, external_id\)/);
  });

  it('CRITICAL REGRESSION: idx_leads_source_external MUST NOT be a partial index', () => {
    // Partial unique index (with WHERE) 会破坏 Supabase .upsert({ onConflict: 'source,external_id' })
    // 因为 PostgREST 生成 ON CONFLICT (source, external_id) 不会匹配 partial index。
    // 必须保持普通 unique index。
    const idxStmt = stmts.find((s) =>
      /create unique index if not exists idx_leads_source_external/.test(s),
    );
    expect(idxStmt, 'idx_leads_source_external statement must exist').toBeTruthy();
    expect(idxStmt!).not.toMatch(/\bwhere\b/);
  });

  it('drops and recreates idx_leads_source_external (migration correctness)', () => {
    // 已跑过老 partial 版本的库需要先 drop 再建新的
    expect(sql).toMatch(/drop index if exists idx_leads_source_external/);
  });

  it('V1 migration backfills metro_area for existing rows', () => {
    expect(sql).toMatch(/update leads set metro_area = 'sf_bay'/);
    expect(sql).toMatch(/update leads set metro_area = 'houston'/);
  });

  it('ALL create trigger statements are preceded by DROP TRIGGER IF EXISTS', () => {
    // Postgres 不支持 `create trigger if not exists`；必须先 drop 才能 re-run
    const createTriggers = stmts.filter((s) => /^create trigger /.test(s));
    for (const s of createTriggers) {
      const triggerName = /create trigger (\w+)/.exec(s)?.[1];
      expect(triggerName, `stmt: ${s}`).toBeTruthy();
      const drop = stmts.find(
        (d) => d.includes(`drop trigger if exists ${triggerName}`),
      );
      expect(drop, `expected DROP TRIGGER IF EXISTS ${triggerName} before CREATE`).toBeTruthy();
    }
  });
});
