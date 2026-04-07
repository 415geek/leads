-- MenusifuLeads Database Schema
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
