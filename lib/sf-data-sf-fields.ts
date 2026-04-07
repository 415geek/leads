import type { LeadSourceRaw } from '@/types/lead';
import { pickText } from '@/lib/bay-area-food-import/shared';

/** DataSF g8m3-pdis（Business Registration）行上常见字段 */
export interface SfG8m3Shape {
  ownership_name?: unknown;
  business_name?: unknown;
  dba_name?: unknown;
  certificate_number?: unknown;
  ttxid?: unknown;
  uniqueid?: unknown;
  full_business_address?: unknown;
  city?: unknown;
  state?: unknown;
  business_zip?: unknown;
  business_phone?: unknown;
  mailing_address_1?: unknown;
  mail_city?: unknown;
  mail_state?: unknown;
  mail_zipcode?: unknown;
  naic_code?: unknown;
  naic_code_description?: unknown;
  naics_code_descriptions_list?: unknown;
  lic?: unknown;
  lic_code_description?: unknown;
  lic_code_descriptions_list?: unknown;
  dba_start_date?: unknown;
  dba_end_date?: unknown;
  location_start_date?: unknown;
  location_end_date?: unknown;
  neighborhoods_analysis_boundaries?: unknown;
  business_corridor?: unknown;
  supervisor_district?: unknown;
}

function asRecord(raw: LeadSourceRaw): Record<string, unknown> {
  return raw;
}

/** 判断是否像 DataSF g8m3-pdis 行（用于详情页展示摘要） */
export function isSfG8m3SourceRaw(raw: LeadSourceRaw | null | undefined): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const o = asRecord(raw);
  return (
    typeof o.uniqueid === 'string' ||
    typeof o.certificate_number === 'string' ||
    (typeof o.ownership_name === 'string' && typeof o.dba_name === 'string')
  );
}

/** 导入时用：展示名优先 DBA，其次法人/业主名，再次注册 business_name */
export function sfG8m3DisplayName(row: SfG8m3Shape): string | null {
  const dba = pickText(row.dba_name);
  const owner = pickText(row.ownership_name);
  const legal = pickText(row.business_name);
  return dba || owner || legal || null;
}

/** 导入时用：传给菜系推断的「注册名」侧写 */
export function sfG8m3LegalNameForCuisine(row: SfG8m3Shape): string | null {
  return pickText(row.business_name) || pickText(row.ownership_name) || null;
}

export type SfRegistrationBrief = {
  ownershipName: string | null;
  dbaName: string | null;
  businessName: string | null;
  certificateNumber: string | null;
  ttxid: string | null;
  uniqueid: string | null;
  streetAddress: string | null;
  cityStateZip: string | null;
  businessPhone: string | null;
  mailingLine: string | null;
  naicsLine: string | null;
  licenseLine: string | null;
  dbaStart: string | null;
  dbaEnd: string | null;
  locationStart: string | null;
  locationEnd: string | null;
  neighborhood: string | null;
  corridor: string | null;
  supervisorDistrict: string | null;
};

function fmtDate(v: unknown): string | null {
  const s = pickText(v);
  if (!s) return null;
  const day = s.split('T')[0];
  return day || null;
}

/** 从 source_raw 抽出 DataSF 摘要（供 Lead Profile 顶部展示） */
export function summarizeSfG8m3FromSourceRaw(raw: LeadSourceRaw | null | undefined): SfRegistrationBrief | null {
  if (!raw || !isSfG8m3SourceRaw(raw)) return null;
  const o = asRecord(raw) as unknown as SfG8m3Shape;

  const city = pickText(o.city);
  const state = pickText(o.state);
  const zip = pickText(o.business_zip);
  const cityStateZip = [city, state, zip].filter(Boolean).join(', ') || null;

  const mailParts = [pickText(o.mailing_address_1), pickText(o.mail_city), pickText(o.mail_state), pickText(o.mail_zipcode)].filter(
    Boolean,
  );
  const mailingLine = mailParts.length ? mailParts.join(', ') : null;

  const naics =
    pickText(o.naic_code_description) ||
    pickText(o.naics_code_descriptions_list) ||
    pickText(o.naic_code);
  const lic =
    pickText(o.lic_code_description) ||
    pickText(o.lic_code_descriptions_list) ||
    pickText(o.lic);

  return {
    ownershipName: pickText(o.ownership_name),
    dbaName: pickText(o.dba_name),
    businessName: pickText(o.business_name),
    certificateNumber: pickText(o.certificate_number),
    ttxid: pickText(o.ttxid),
    uniqueid: pickText(o.uniqueid),
    streetAddress: pickText(o.full_business_address),
    cityStateZip,
    businessPhone: pickText(o.business_phone),
    mailingLine,
    naicsLine: naics,
    licenseLine: lic,
    dbaStart: fmtDate(o.dba_start_date),
    dbaEnd: fmtDate(o.dba_end_date),
    locationStart: fmtDate(o.location_start_date),
    locationEnd: fmtDate(o.location_end_date),
    neighborhood: pickText(o.neighborhoods_analysis_boundaries),
    corridor: pickText(o.business_corridor),
    supervisorDistrict: pickText(o.supervisor_district),
  };
}
