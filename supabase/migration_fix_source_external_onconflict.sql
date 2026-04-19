-- ---------------------------------------------------------------------------
-- 修复 `/api/leads/import` 报错：
--   upsert(withExt) failed: there is no unique or exclusion constraint
--   matching the ON CONFLICT specification
--
-- 原因：
--   schema.sql 原来用 partial unique index（where external_id is not null）。
--   Supabase .upsert({ onConflict: 'source,external_id' }) 生成
--   ON CONFLICT (source, external_id)，PostgREST 不支持 partial index。
--
-- 修复：
--   drop 掉 partial 版本，改为普通 unique index。
--   Postgres 默认 NULLS DISTINCT，(sf_gov, NULL) 多行仍互不冲突，功能不变。
--
-- 执行方法：Supabase → SQL Editor → 粘贴本文件全部 → Run
-- 可重复执行（drop if exists + create if not exists）。
-- ---------------------------------------------------------------------------

drop index if exists idx_leads_source_external;

create unique index if not exists idx_leads_source_external
  on leads (source, external_id);

-- 自检：确认 pg_indexes 里这个索引没有 WHERE 子句
-- 预期 indexdef 不包含 'WHERE'
-- select indexname, indexdef from pg_indexes
--  where tablename = 'leads' and indexname = 'idx_leads_source_external';
