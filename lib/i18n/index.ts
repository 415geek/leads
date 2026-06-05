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
    '支持按姓名、地址或地区在 Whitepages 检索；仅填地址也可搜索，并自动结合全网与政府登记信息做 Claude 交叉验证评分。匹配关键字可选（不填时用地址作为验证线索）。',
  owner_label_name: '姓名',
  owner_label_region: '地区',
  owner_label_address: '地址',
  owner_label_keywords: '匹配关键字',
  owner_placeholder_name: '例如：Tony Lu（姓名/地址/地区三选一）',
  owner_placeholder_region: '例如：San Francisco, CA / California',
  owner_placeholder_address: '例如：2406 19th Ave 或 123 Market St, San Francisco, CA 94102（可单独搜索）',
  owner_placeholder_keywords: '例如：Lu’s Kitchen / 老板姓名（可选；仅地址时自动用地址验证）',
  owner_search_button: '搜索',
  owner_searching: '搜索中…',
  owner_searching_with_keywords: '联网交叉验证中…',
  owner_no_results: '未找到匹配的老板信息。',
  owner_results_summary: (total: number, loaded: number) =>
    `共 ${total.toLocaleString()} 条匹配；已加载 ${loaded} 条（单次最多 15 条）。`,
  owner_showing_range: (start: number, end: number, loaded: number) =>
    `当前显示第 ${start}–${end} 条，共 ${loaded} 条`,
  owner_match_score: (score: number) => `Whitepages ${score} 分`,
  owner_keyword_score: (score: number) => `关键字匹配 ${score} 分`,
  owner_keyword_analysis_note: (
    model: string,
    snippets: number,
    registry: number,
    ocCompanies: number,
  ) =>
    `已用 ${model} 深度交叉验证：全网 ${snippets} 条 + 政府/OpenCorporates 登记 ${registry} 条${ocCompanies > 0 ? ` + OpenCorporates API ${ocCompanies} 家企业` : ''}，结果按匹配度排序。`,
  owner_web_evidence: '联网依据',
  owner_aliases: '别称',
  owner_work: '职务 / 公司',
  owner_phones: '电话',
  owner_emails: '邮箱',
  owner_current_address: '现居地址',
  owner_past_address: '历史地址',
  owner_properties: '名下房产',
  owner_linkedin: 'LinkedIn',
  owner_dob: '出生日期',
  owner_relatives: '亲属',
  owner_matched_by: '匹配依据',
  owner_deceased: '已故',
  owner_more_addresses: (n: number) => `另有 ${n} 条历史地址`,
  owner_raw_json: '查看原始 API 数据',
  owner_metadata: '响应 metadata',
  owner_evidence_saved: (evidenceCount: number, contactsCount: number | null) =>
    contactsCount != null && contactsCount > 0
      ? `已写入 ${evidenceCount} 条证据，交叉验证后更新 ${contactsCount} 条联系方式。`
      : `已写入 ${evidenceCount} 条证据到线索档案。`,

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
    'Search Whitepages by name, address, or region. Address-only runs web + registry cross-validation with Claude. Keywords optional (address used when blank).',
  owner_label_name: 'Name',
  owner_label_region: 'Region',
  owner_label_address: 'Address',
  owner_label_keywords: 'Match keywords',
  owner_placeholder_name: 'e.g. Tony Lu (name, address, or region)',
  owner_placeholder_region: 'e.g. San Francisco, CA / California',
  owner_placeholder_address: 'e.g. 2406 19th Ave or full street address (address-only OK)',
  owner_placeholder_keywords: 'e.g. Lu’s Kitchen / owner name (optional; address used if blank)',
  owner_search_button: 'Search',
  owner_searching: 'Searching…',
  owner_searching_with_keywords: 'Cross-validating with web search…',
  owner_no_results: 'No matching owner records found.',
  owner_results_summary: (total: number, loaded: number) =>
    `${total.toLocaleString()} matches; loaded ${loaded} (max 15 per request).`,
  owner_showing_range: (start: number, end: number, loaded: number) =>
    `Showing ${start}–${end} of ${loaded}`,
  owner_match_score: (score: number) => `Whitepages ${score}`,
  owner_keyword_score: (score: number) => `Keyword match ${score}`,
  owner_keyword_analysis_note: (
    model: string,
    snippets: number,
    registry: number,
    ocCompanies: number,
  ) =>
    `Ranked by ${model} deep cross-validation: ${snippets} web + ${registry} registry/OC snippets${ocCompanies > 0 ? ` + ${ocCompanies} OpenCorporates companies` : ''}.`,
  owner_web_evidence: 'Web evidence',
  owner_aliases: 'Also known as',
  owner_work: 'Role / Company',
  owner_phones: 'Phone',
  owner_emails: 'Email',
  owner_current_address: 'Current address',
  owner_past_address: 'Past addresses',
  owner_properties: 'Owned property',
  owner_linkedin: 'LinkedIn',
  owner_dob: 'Date of birth',
  owner_relatives: 'Relatives',
  owner_matched_by: 'Matched by',
  owner_deceased: 'Deceased',
  owner_more_addresses: (n: number) => `${n} more past address(es)`,
  owner_raw_json: 'View raw API JSON',
  owner_metadata: 'Response metadata',
  owner_evidence_saved: (evidenceCount: number, contactsCount: number | null) =>
    contactsCount != null && contactsCount > 0
      ? `Saved ${evidenceCount} evidence row(s); cross-validation updated ${contactsCount} contact(s).`
      : `Saved ${evidenceCount} evidence row(s) to this lead.`,

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
