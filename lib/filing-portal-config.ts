/**
 * 各州政府企业备案门户配置 —— 详情页「政府备案」模块按州展示不同搜索入口。
 */

import { getSourceById } from '@/lib/sources/registry';
import type { MetroArea } from '@/lib/sources/types';

export interface FilingPortalConfig {
  stateCode: string;
  panelTitle: string;
  description: string;
  searchLinkLabel: string | null;
  searchUrl: string | null;
  /** 点击外链时是否复制店名到剪贴板（BizFile / SOSDirect 等不支持 URL 预填） */
  clipboardOnOpen: boolean;
  entityLabel: string | null;
  showEntityField: boolean;
  dateTimezone: string;
  controlIdPlaceholder: string;
  manualTypePlaceholder: string;
}

const METRO_TO_STATE: Record<MetroArea, string> = {
  sf_bay: 'CA',
  la: 'CA',
  nyc: 'NY',
  chicago: 'IL',
  houston: 'TX',
  dallas: 'TX',
  austin: 'TX',
  seattle: 'WA',
  boston: 'MA',
  las_vegas: 'NV',
  miami: 'FL',
  phoenix: 'AZ',
  denver: 'CO',
  atlanta: 'GA',
};

const STATE_PORTALS: Record<string, FilingPortalConfig> = {
  CA: {
    stateCode: 'CA',
    panelTitle: '政府备案（California Secretary of State）',
    description:
      '在站内查看该企业的备案时间线与 PDF 链接。数据由你方通过 n8n 同步 BizFile 或手动录入；本站不代爬 SOS。',
    searchLinkLabel: '打开 CA BizFile 搜索 ↗',
    searchUrl: 'https://bizfileonline.sos.ca.gov/search/business',
    clipboardOnOpen: true,
    entityLabel: 'CA 实体编号',
    showEntityField: true,
    dateTimezone: 'America/Los_Angeles',
    controlIdPlaceholder: '6071392',
    manualTypePlaceholder: 'e.g. Statement of Information',
  },
  TX: {
    stateCode: 'TX',
    panelTitle: '政府备案（Texas Secretary of State）',
    description:
      '在站内查看 LLC/Corp 等实体备案时间线与文档链接。数据由 n8n 同步 SOSDirect / 县 DBA 或手动录入；本站不代爬州政府网站。',
    searchLinkLabel: '打开 TX SOSDirect 搜索 ↗',
    searchUrl: 'https://direct.sos.state.tx.us/',
    clipboardOnOpen: true,
    entityLabel: 'TX 文件编号',
    showEntityField: false,
    dateTimezone: 'America/Chicago',
    controlIdPlaceholder: '801234567',
    manualTypePlaceholder: 'e.g. Certificate of Formation',
  },
  NY: {
    stateCode: 'NY',
    panelTitle: '政府备案（New York Department of State）',
    description:
      '在站内查看 DOS 企业备案时间线与文档链接。数据由 n8n 同步或手动录入；本站不代爬州政府网站。',
    searchLinkLabel: '打开 NY DOS 企业查询 ↗',
    searchUrl: 'https://apps.dos.ny.gov/publicInquiry/',
    clipboardOnOpen: false,
    entityLabel: 'NY DOS ID',
    showEntityField: false,
    dateTimezone: 'America/New_York',
    controlIdPlaceholder: 'Document ID',
    manualTypePlaceholder: 'e.g. Initial DOS Filing',
  },
  IL: {
    stateCode: 'IL',
    panelTitle: '政府备案（Illinois Secretary of State）',
    description:
      '在站内查看 Illinois SOS 企业备案时间线与文档链接。数据由 n8n 同步或手动录入。',
    searchLinkLabel: '打开 IL SOS 企业搜索 ↗',
    searchUrl: 'https://www.ilsos.gov/corporatellc/',
    clipboardOnOpen: false,
    entityLabel: 'IL 文件编号',
    showEntityField: false,
    dateTimezone: 'America/Chicago',
    controlIdPlaceholder: 'File number',
    manualTypePlaceholder: 'e.g. LLC Formation',
  },
  WA: {
    stateCode: 'WA',
    panelTitle: '政府备案（Washington Secretary of State）',
    description: '在站内查看 WA SOS 企业备案时间线与文档链接。数据由 n8n 同步或手动录入。',
    searchLinkLabel: '打开 WA Corporations Search ↗',
    searchUrl: 'https://ccfs.sos.wa.gov/',
    clipboardOnOpen: false,
    entityLabel: 'UBI / 文件编号',
    showEntityField: false,
    dateTimezone: 'America/Los_Angeles',
    controlIdPlaceholder: 'UBI number',
    manualTypePlaceholder: 'e.g. Initial Report',
  },
  MA: {
    stateCode: 'MA',
    panelTitle: '政府备案（Massachusetts Secretary of State）',
    description: '在站内查看 MA SOS 企业备案时间线与文档链接。数据由 n8n 同步或手动录入。',
    searchLinkLabel: '打开 MA Corp Search ↗',
    searchUrl: 'https://corp.sec.state.ma.us/corpweb/CorpSearch/CorpSearch.aspx',
    clipboardOnOpen: false,
    entityLabel: 'MA 文件编号',
    showEntityField: false,
    dateTimezone: 'America/New_York',
    controlIdPlaceholder: 'Identification number',
    manualTypePlaceholder: 'e.g. Articles of Organization',
  },
};

const DEFAULT_PORTAL: FilingPortalConfig = {
  stateCode: 'US',
  panelTitle: '政府备案',
  description:
    '在站内查看政府备案时间线与文档链接。数据由 n8n 同步或手动录入；请根据线索所在州选择对应政府门户核对。',
  searchLinkLabel: null,
  searchUrl: null,
  clipboardOnOpen: false,
  entityLabel: null,
  showEntityField: false,
  dateTimezone: 'America/Los_Angeles',
  controlIdPlaceholder: 'Control / file ID',
  manualTypePlaceholder: 'e.g. Initial Filing',
};

function parseStateFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const tail = address.match(/,\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$/i);
  if (tail?.[1]) return tail[1].toUpperCase();
  const embedded = address.match(/\b([A-Z]{2})\s+\d{5}\b/);
  return embedded?.[1]?.toUpperCase() ?? null;
}

export function resolveFilingPortalConfig(input: {
  metro_area?: string | null;
  source?: string | null;
  city?: string | null;
  address?: string | null;
}): FilingPortalConfig {
  let state: string | null = null;

  const metro = input.metro_area?.trim() as MetroArea | undefined;
  if (metro && metro in METRO_TO_STATE) {
    state = METRO_TO_STATE[metro as MetroArea];
  }

  if (!state && input.source) {
    const src = getSourceById(input.source.trim());
    if (src?.state) state = src.state.toUpperCase();
  }

  if (!state) {
    state = parseStateFromAddress(input.address);
  }

  if (!state && input.source && /^(houston|tx_|harris)/i.test(input.source)) {
    state = 'TX';
  }

  if (state && STATE_PORTALS[state]) {
    return STATE_PORTALS[state];
  }

  return DEFAULT_PORTAL;
}

export function formatFiledDateForPortal(iso: string | null, timezone: string): string {
  if (!iso) return '—';
  const d = new Date(iso + (iso.length <= 10 ? 'T12:00:00' : ''));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
}
