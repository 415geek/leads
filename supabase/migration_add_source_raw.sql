-- 在已有 Supabase 项目上执行一次：保存政府开放数据完整登记 JSON
alter table leads add column if not exists source_raw jsonb;

comment on column leads.source_raw is '政府/来源 API 返回的完整登记字段（JSON）';
