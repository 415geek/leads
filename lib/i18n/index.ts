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

  // Leads page
  leads_title: 'Leads 管理',
  import_all: '导入全部启用城市',
  search_placeholder: '搜索餐厅名称或地址…',
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

  leads_title: 'Leads Management',
  import_all: 'Import All Enabled Cities',
  search_placeholder: 'Search by restaurant name or address…',
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
