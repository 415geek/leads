-- Restaurant Leads Finder — database schema
-- 运行此 SQL 在 Supabase 中创建 leads 表

-- 启用 UUID 扩展
create extension if not exists "uuid-ossp";

-- Leads 主表
create table if not exists leads (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  address text,
  phone text,
  cuisine_type text,
  city text default 'San Francisco',
  source text default 'sf_gov',
  license_date date,
  license_type text,
  source_raw jsonb,
  lead_score integer default 0,
  lead_status text default 'new' check (lead_status in ('new','contacted','in_progress','converted','not_interested')),
  outreach_message text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(name, address)
);

-- 自动更新 updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists leads_updated_at on leads;
create trigger leads_updated_at
  before update on leads
  for each row execute function update_updated_at();

-- 索引
create index if not exists idx_leads_score on leads(lead_score desc);
create index if not exists idx_leads_status on leads(lead_status);
create index if not exists idx_leads_city on leads(city);
create index if not exists idx_leads_license_date on leads(license_date desc);
create index if not exists idx_leads_created on leads(created_at desc);

-- 测试数据（可选，用于开发测试）
-- insert into leads (name, address, phone, cuisine_type, city, license_date, lead_score, lead_status) values
-- ('金龙餐厅', '123 Main St, San Francisco, CA', '415-555-1234', '粤菜', 'San Francisco', current_date - interval '5 days', 85, 'new'),
-- ('川味坊', '456 Market St, San Francisco, CA', '415-555-5678', '川菜', 'San Francisco', current_date - interval '10 days', 78, 'new'),
-- ('东北饺子馆', '789 Mission St, Oakland, CA', '510-555-9012', '东北菜', 'Oakland', current_date - interval '20 days', 65, 'contacted');

-- ---------------------------------------------------------------------------
-- 已有数据库补列（若曾报错：Could not find the 'source_raw' column…）
-- 在 Supabase → SQL Editor 执行本节即可，可重复执行（IF NOT EXISTS）
-- ---------------------------------------------------------------------------

alter table leads add column if not exists source_raw jsonb;

comment on column leads.source_raw is '政府/来源 API 返回的完整登记字段（JSON）';

-- ---------------------------------------------------------------------------
-- CA Secretary of State（bizfileonline.sos.ca.gov）等企业备案附件
-- 在 Supabase SQL Editor 对已有库执行以下段落（或整文件）
-- ---------------------------------------------------------------------------

alter table leads add column if not exists ca_entity_number text;

comment on column leads.ca_entity_number is 'California SOS entity number / 搜索用编号，便于跳转州政府网站';

create table if not exists lead_filings (
  id uuid default uuid_generate_v4() primary key,
  lead_id uuid not null references leads(id) on delete cascade,
  source text not null default 'ca_sos' check (source in ('ca_sos', 'manual')),
  filing_type text not null,
  control_id text,
  filed_date date,
  document_url text,
  extra jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_lead_filings_lead_id on lead_filings(lead_id);
create index if not exists idx_lead_filings_filed_date on lead_filings(lead_id, filed_date desc nulls last);

create unique index if not exists idx_lead_filings_dedupe_control
  on lead_filings (lead_id, control_id)
  where control_id is not null and length(trim(control_id)) > 0;

-- ---------------------------------------------------------------------------
-- V1 情报层升级：全美多城 + AI 分类 + Google Places enrichment
-- 所有语句幂等；对已有生产库可重复执行
--
-- 数据流：
--   ingest → normalize → classify(AI) → enrich(Google) → score → upsert(leads + lead_enrichment)
--
-- 关键变化：
--   1. 新增 external_id / metro_area / first_seen_at / first_inspection_date
--      / is_restaurant_confidence / ai_classification 列
--   2. (name,address) unique 拆成：
--        - (source, external_id) 主去重键（有 external_id 时）
--        - (lower(name), lower(address), lower(city)) 回落键（n8n 旧 payload 等无 external_id）
--   3. 新增 lead_enrichment 表（Google Places 缓存 + 解耦）
--   4. 新增 lead_classification_log 表（AI 分类 trace，便于回归与审计）
-- ---------------------------------------------------------------------------

-- 1. leads 表新增列（全部幂等）
alter table leads add column if not exists external_id text;
alter table leads add column if not exists metro_area text;
alter table leads add column if not exists first_seen_at timestamptz default now();
alter table leads add column if not exists first_inspection_date date;
alter table leads add column if not exists is_restaurant_confidence numeric(3,2);
alter table leads add column if not exists ai_classification jsonb;

comment on column leads.external_id is '来源数据集内的业务 ID，与 source 组合成跨城唯一键';
comment on column leads.metro_area is '都会区代码（sf_bay / nyc / la / chicago / houston / seattle / austin / boston）';
comment on column leads.first_seen_at is '本系统首次入库时间，新鲜度评分用';
comment on column leads.first_inspection_date is 'inspection 类数据源的最早检查日期，作为 license_date 的代理';
comment on column leads.is_restaurant_confidence is 'AI 分类器置信度 0..1，UI 可按此过滤';
comment on column leads.ai_classification is 'AI 分类完整输出 JSON（模型、菜系猜测、raw_signal 等）';

-- 2. 改 unique 约束：老的 (name, address) 不再是主去重键
--    Postgres 为 `unique(name, address)` 自动生成 leads_name_address_key
alter table leads drop constraint if exists leads_name_address_key;

-- 2a. 新主去重键：(source, external_id)
--     不能用 partial index（where external_id is not null）——Supabase .upsert({onConflict:'source,external_id'})
--     会生成 ON CONFLICT (source, external_id)，PostgREST 不支持 partial index 的 WHERE 子句，会报
--     "no unique or exclusion constraint matching the ON CONFLICT specification"。
--     改用普通 unique index：Postgres 默认 NULLS DISTINCT，(sf_gov, NULL) 多行互不相同，
--     功能上与 partial index 等价。
drop index if exists idx_leads_source_external;
create unique index if not exists idx_leads_source_external
  on leads (source, external_id);

-- 2b. 回落去重键：(lower(name), lower(address), lower(city)) — 兼容 n8n 旧 payload 与历史数据
--     保留 partial index（这里不走 ON CONFLICT 路径，是应用层查重 + 单条 insert 用的）
create unique index if not exists idx_leads_name_address_city_lower
  on leads (lower(name), lower(coalesce(address, '')), lower(city))
  where external_id is null;

-- 2c. metro_area 索引
create index if not exists idx_leads_metro on leads(metro_area);

-- 2d. AI 置信度索引（用户按 confidence 过滤时需要）
create index if not exists idx_leads_confidence on leads(is_restaurant_confidence desc nulls last);

-- 3. lead_enrichment：Google Places 结果（和 leads 解耦，便于按 place_id 二次查询 / 回滚）
create table if not exists lead_enrichment (
  lead_id uuid primary key references leads(id) on delete cascade,
  google_place_id text,
  google_raw jsonb,
  formatted_phone text,
  business_status text,
  google_types text[],
  fetched_at timestamptz default now()
);

create index if not exists idx_enrichment_place_id on lead_enrichment(google_place_id);
create index if not exists idx_enrichment_fetched_at on lead_enrichment(fetched_at desc);

comment on table lead_enrichment is 'Google Places Text Search 缓存，90 天有效期由 fetched_at 判断';
comment on column lead_enrichment.business_status is 'OPERATIONAL / CLOSED_TEMPORARILY / CLOSED_PERMANENTLY';

-- 4. lead_classification_log：AI 分类 trace，回归 / 审计 / 成本分析用
create table if not exists lead_classification_log (
  id uuid default uuid_generate_v4() primary key,
  source text not null,
  external_id text,
  name text not null,
  raw_signal text,
  is_restaurant boolean,
  confidence numeric(3,2),
  cuisine_guess text,
  model text,
  created_at timestamptz default now()
);

create index if not exists idx_classification_source_ext
  on lead_classification_log(source, external_id);
create index if not exists idx_classification_created
  on lead_classification_log(created_at desc);

-- 5. 老数据回填 metro_area（幂等：只回填 metro_area IS NULL 的行）
update leads set metro_area = 'sf_bay'
  where metro_area is null and source in ('sf_gov', 'berkeley_open_data');
update leads set metro_area = 'houston'
  where metro_area is null and source = 'houston_hdhhs';
-- 其他/未知 source 不强行归类，保持 NULL，由后续 adapter 注册后的新入库数据自然填入
