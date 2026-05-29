'use client';

import { createContext, useContext } from 'react';

const zh = {
  // Header
  appTitle: 'Restaurant Leads Finder',
  nav_dashboard: '仪表盘',
  nav_leads: '线索管理',
  nav_logout: '退出',
  lang_toggle: 'EN',

  // Dashboard
  dashboard_title: '仪表盘',
  stat_total: '总线索',
  stat_new_this_week: '本周新增',
  stat_hot_leads: '热门线索 (80+分)',
  stat_converted: '已成交',
  section_recent: '最新线索',
  section_map: 'Leads 地图',
  map_loading: '地图加载中…',
  empty_state: '暂无数据。请通过导入功能添加线索。',
  view_all: '查看全部 →',
  business_search: '商业搜索',
  owner_title: '老板信息搜索',
  owner_description:
    '按姓名、地区或公司名搜索餐厅老板/经营者（Whitepages Pro Person Search API，下方展示 API 返回的全部字段）。',
  owner_label_name: '姓名',
  owner_label_region: '地区',
  owner_label_company: '公司 / 店名',
  owner_placeholder_name: '例如：John Smith',
  owner_placeholder_region: '例如：San Francisco, CA / California',
  owner_placeholder_company: '例如：Acme Restaurant（可选，结果内过滤）',
  owner_search_button: '搜索',
  owner_searching: '搜索中…',
  owner_no_results: '未找到匹配的老板信息。',
  owner_results_summary: (total: number, shown: number) =>
    `共 ${total} 条匹配，本页展示 ${shown} 条（Whitepages Pro 单次最多 15 条）。`,
  owner_company_filter_note:
    'Whitepages API 不支持按公司名检索；已在返回结果中按 company_name / job_title 做客户端过滤。',

  // Leads page
  leads_title: 'Leads 管理',
  import_all: '导入全部启用城市',
  search_placeholder: '搜索餐厅名称或地址…',
  filter_label_city: '城市',
  filter_label_date: '登记日期',
  filter_label_confidence: 'AI 置信度',
  filter_unlimited: '不限',
  filter_city_placeholder: '输入城市名',
  date_range_all: '不限',
  date_range_7d: '最近 7 天',
  date_range_30d: '最近 30 天',
  date_range_90d: '最近 90 天',
  date_range_custom: '自定义区间',
  confidence_06: '≥ 0.6（推荐）',
  confidence_08: '≥ 0.8（严格）',
  confidence_09: '≥ 0.9（极严格）',
  date_from: '开始日期',
  date_to: '结束日期',
  date_range_to: '至',
  status_all: '全部状态',
  status_new: '新线索',
  status_contacted: '已联系',
  status_in_progress: '跟进中',
  status_converted: '已成交',
  status_not_interested: '无意向',
  col_restaurant: '餐厅',
  col_city: '城市',
  col_source: '来源',
  col_score: '评分',
  col_status: '状态',
  col_actions: '操作',
  prev_page: '← 上一页',
  next_page: '下一页 →',
  page_info: (cur: number, total: number) => `第 ${cur} / ${total} 页`,
  no_leads: '暂无线索。',
  generate_message: '生成邮件',
  view_detail: '查看',

  // Common
  loading: '加载中…',
  error_load: '加载失败',
};

const en: typeof zh = {
  appTitle: 'Restaurant Leads Finder',
  nav_dashboard: 'Dashboard',
  nav_leads: 'Leads',
  nav_logout: 'Logout',
  lang_toggle: '中文',

  dashboard_title: 'Dashboard',
  stat_total: 'Total Leads',
  stat_new_this_week: 'New This Week',
  stat_hot_leads: 'Hot Leads (80+)',
  stat_converted: 'Converted',
  section_recent: 'Recent Leads',
  section_map: 'Leads Map',
  map_loading: 'Loading map…',
  empty_state: 'No data yet. Use the import button to add leads.',
  view_all: 'View all →',
  business_search: 'Search',
  owner_title: 'Business Owner Search',
  owner_description:
    'Search restaurant owners by name, region, or company (Whitepages Pro Person Search API; all response fields shown below).',
  owner_label_name: 'Name',
  owner_label_region: 'Region',
  owner_label_company: 'Company / DBA',
  owner_placeholder_name: 'e.g. John Smith',
  owner_placeholder_region: 'e.g. San Francisco, CA / California',
  owner_placeholder_company: 'e.g. Acme Restaurant (optional, filters results)',
  owner_search_button: 'Search',
  owner_searching: 'Searching…',
  owner_no_results: 'No matching owner records found.',
  owner_results_summary: (total: number, shown: number) =>
    `${total} matches; showing ${shown} (Whitepages Pro max 15 per request).`,
  owner_company_filter_note:
    'Whitepages API does not search by company; results were filtered client-side by company_name / job_title.',

  leads_title: 'Leads Management',
  import_all: 'Import All Enabled Cities',
  search_placeholder: 'Search by restaurant name or address…',
  filter_label_city: 'City',
  filter_label_date: 'License date',
  filter_label_confidence: 'AI confidence',
  filter_unlimited: 'Any',
  filter_city_placeholder: 'Type a city',
  date_range_all: 'Any',
  date_range_7d: 'Last 7 days',
  date_range_30d: 'Last 30 days',
  date_range_90d: 'Last 90 days',
  date_range_custom: 'Custom range',
  confidence_06: '≥ 0.6 (recommended)',
  confidence_08: '≥ 0.8 (strict)',
  confidence_09: '≥ 0.9 (very strict)',
  date_from: 'From',
  date_to: 'To',
  date_range_to: 'to',
  status_all: 'All Statuses',
  status_new: 'New',
  status_contacted: 'Contacted',
  status_in_progress: 'In Progress',
  status_converted: 'Converted',
  status_not_interested: 'Not Interested',
  col_restaurant: 'Restaurant',
  col_city: 'City',
  col_source: 'Source',
  col_score: 'Score',
  col_status: 'Status',
  col_actions: 'Actions',
  prev_page: '← Prev',
  next_page: 'Next →',
  page_info: (cur: number, total: number) => `Page ${cur} of ${total}`,
  no_leads: 'No leads found.',
  generate_message: 'Draft Email',
  view_detail: 'View',

  loading: 'Loading…',
  error_load: 'Failed to load',
};

export type Lang = 'zh' | 'en';
export type Translations = typeof zh;

export const translations: Record<Lang, Translations> = { zh, en };

export const LanguageContext = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Translations;
}>({
  lang: 'zh',
  setLang: () => {},
  t: zh,
});

export function useTranslations() {
  return useContext(LanguageContext);
}
