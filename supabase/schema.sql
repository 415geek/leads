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
