/**
 * DataSF g8m3-pdis —— 「新开店 / 疑似转手」规则层（见用户文档 datasf_new_opening_transfer_identification_logic.md）
 *
 * 仅用于 source=sf_gov；inspection 类城市源不适用。
 */

import { pickText } from '@/lib/bay-area-food-import/shared';

export type NewOpeningLabel =
  | 'confirmed_new_opening'
  | 'likely_new_opening'
  | 'possible_new_opening'
  | 'weak_signal';

export type TransferLabel =
  | 'high_confidence_transfer'
  | 'likely_transfer'
  | 'possible_transfer'
  | 'weak_signal'
  | 'none';

export type OpeningReasonCode =
  | 'RECENT_LOCATION_START'
  | 'ACTIVE_RECORD'
  | 'FOOD_SERVICE_NAICS'
  | 'RESTAURANT_LICENSE_MATCH'
  | 'BUSINESS_AND_LOCATION_START_DATES_CLOSE'
  | 'MATCHED_PRIOR_CLOSED_RECORD_AT_SAME_ADDRESS'
  | 'SHORT_GAP_BETWEEN_OLD_END_AND_NEW_START'
  | 'OWNER_NAME_CHANGED'
  | 'BUSINESS_ACCOUNT_CHANGED'
  | 'DBA_NAME_CHANGED'
  | 'SAME_INDUSTRY_CONTINUES_AT_ADDRESS'
  | 'UNIT_MATCH_CONFIRMED';

export interface DatasfOpeningSignals {
  new_opening_score: number;
  new_opening_label: NewOpeningLabel;
  transfer_score: number;
  transfer_label: TransferLabel;
  reason_codes: OpeningReasonCode[];
  is_new_at_location: boolean;
  is_new_business_entity: boolean;
  normalized_address_key: string;
  manual_review_priority: 'high' | 'medium' | 'low';
}

const LEGAL_SUFFIX = /\b(LLC|L\.L\.C\.|INC\.?|CORP\.?|CORPORATION|LTD\.?|LP|L\.P\.|CO\.?)\b/gi;
const NOISE_WORDS = /\b(THE|SAN FRANCISCO|SF)\b/gi;

export function normalizeAddressForDatasf(addr: string | null | undefined): string {
  const a = pickText(addr);
  if (!a) return '';
  let s = a.toUpperCase().replace(/\s+/g, ' ').trim();
  s = s
    .replace(/\bSTREET\b/g, 'ST')
    .replace(/\bAVENUE\b/g, 'AVE')
    .replace(/\bBOULEVARD\b/g, 'BLVD')
    .replace(/\bROAD\b/g, 'RD')
    .replace(/\bDRIVE\b/g, 'DR')
    .replace(/\bSUITE\b/g, 'STE')
    .replace(/\bUNIT\b/g, 'UNIT')
    .replace(/[#.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

/** 去 suite/unit 后的基址，用于同一物业不同铺位粗匹配 */
export function normalizedBaseAddressKey(addr: string | null | undefined): string {
  const n = normalizeAddressForDatasf(addr);
  return n
    .replace(/\b(STE|UNIT|APT|#)\s*[\w-]+\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeOrgName(name: string | null | undefined): string {
  const t = pickText(name);
  if (!t) return '';
  let s = t.toUpperCase().replace(/[^A-Z0-9\s]/g, ' ');
  s = s.replace(LEGAL_SUFFIX, ' ');
  s = s.replace(NOISE_WORDS, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function tokenJaccard(a: string, b: string): number {
  const ta = new Set(a.split(/\s+/).filter((x) => x.length > 1));
  const tb = new Set(b.split(/\s+/).filter((x) => x.length > 1));
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const x of ta) if (tb.has(x)) inter++;
  return inter / (ta.size + tb.size - inter);
}

function parseDay(s: unknown): Date | null {
  const t = pickText(s);
  if (!t) return null;
  const day = t.split('T')[0];
  const d = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysDiff(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

/** DataSF：Administratively Closed 存成包含该短语的文本；active 一般为 null */
export function isDatasfActiveLocationRow(row: object): boolean {
  const r = row as Record<string, unknown>;
  if (pickText(r.location_end_date)) return false;
  if (pickText(r.dba_end_date)) return false;
  const ac = pickText(r.administratively_closed);
  if (ac && ac.toUpperCase().includes('ADMINISTRATIVELY CLOSED')) return false;
  return true;
}

function isFoodServiceNaics(row: Record<string, unknown>): boolean {
  const desc = `${pickText(row.naic_code_description) ?? ''} ${pickText(row.naics_code_descriptions_list) ?? ''}`.toUpperCase();
  const code = pickText(row.naic_code) ?? '';
  return (
    code.startsWith('722') ||
    desc.includes('FOOD SERVICE') ||
    desc.includes('RESTAURANT') ||
    desc.includes('DRINKING') ||
    desc.includes('CATER')
  );
}

function isRestaurantLic(row: Record<string, unknown>): boolean {
  const lic =
    `${pickText(row.lic_code_description) ?? ''} ${pickText(row.lic_code_descriptions_list) ?? ''} ${pickText(row.lic) ?? ''}`.toUpperCase();
  return (
    lic.includes('RESTAURANT') ||
    lic.includes('TAVERN') ||
    lic.includes('FOOD PREP') ||
    lic.includes('MOBILE FOOD') ||
    lic.includes('CATER') ||
    lic.includes('CAFETERIA') ||
    lic.includes('BAKERY') ||
    lic.includes('CAFE') ||
    lic.includes('EATING PLACE') ||
    lic.includes('DINING')
  );
}

function labelFromNewScore(score: number): NewOpeningLabel {
  if (score >= 80) return 'confirmed_new_opening';
  if (score >= 60) return 'likely_new_opening';
  if (score >= 40) return 'possible_new_opening';
  return 'weak_signal';
}

function labelFromTransferScore(score: number): TransferLabel {
  if (score < 40) return 'none';
  if (score >= 80) return 'high_confidence_transfer';
  if (score >= 60) return 'likely_transfer';
  if (score >= 40) return 'possible_transfer';
  return 'weak_signal';
}

export interface NewOpeningIntelOptions {
  /** 文档默认 90 */
  newOpeningWindowDays?: number;
}

/**
 * 仅新开店评分 + 实体/门店新度标记（不含转手）
 */
export function computeDatasfNewOpeningIntel(
  row: object,
  referenceDate: Date,
  opts: NewOpeningIntelOptions = {},
): Pick<
  DatasfOpeningSignals,
  | 'new_opening_score'
  | 'new_opening_label'
  | 'reason_codes'
  | 'is_new_at_location'
  | 'is_new_business_entity'
  | 'normalized_address_key'
> {
  const r = row as Record<string, unknown>;
  const windowDays = opts.newOpeningWindowDays ?? 90;
  const reasons: OpeningReasonCode[] = [];
  let score = 0;

  const locStart = parseDay(r.location_start_date);
  const dbaStart = parseDay(r.dba_start_date);
  const addrKey = normalizedBaseAddressKey(pickText(r.full_business_address));

  if (!locStart) {
    return {
      new_opening_score: 0,
      new_opening_label: 'weak_signal',
      reason_codes: [],
      is_new_at_location: false,
      is_new_business_entity: false,
      normalized_address_key: addrKey,
    };
  }

  const daysSinceLoc = daysDiff(referenceDate, locStart);
  if (daysSinceLoc >= 0 && daysSinceLoc <= 30) {
    score += 45;
    reasons.push('RECENT_LOCATION_START');
  } else if (daysSinceLoc <= 60) {
    score += 30;
    reasons.push('RECENT_LOCATION_START');
  } else if (daysSinceLoc <= 90) {
    score += 20;
    reasons.push('RECENT_LOCATION_START');
  }

  if (isDatasfActiveLocationRow(r)) {
    score += 20;
    reasons.push('ACTIVE_RECORD');
  }

  if (isFoodServiceNaics(r)) {
    score += 15;
    reasons.push('FOOD_SERVICE_NAICS');
  }

  if (isRestaurantLic(r)) {
    score += 10;
    reasons.push('RESTAURANT_LICENSE_MATCH');
  }

  const dba = pickText(r.dba_name) ?? '';
  const legalish = /\b(LLC|INC|CORP|L\.P\.|LP)\b/i.test(dba);
  if (dba.length >= 4 && !legalish) {
    score += 5;
  }

  let is_new_business_entity = true;
  if (dbaStart && locStart) {
    const dd = Math.abs(daysDiff(locStart, dbaStart));
    if (dd < 60) {
      score += 10;
      reasons.push('BUSINESS_AND_LOCATION_START_DATES_CLOSE');
    }
    const locAfterDba = daysDiff(locStart, dbaStart);
    if (locAfterDba > 365 * 3) is_new_business_entity = false;
  }

  const isNewAtLocation = daysSinceLoc >= 0 && daysSinceLoc <= windowDays;

  return {
    new_opening_score: Math.min(100, score),
    new_opening_label: labelFromNewScore(score),
    reason_codes: reasons,
    is_new_at_location: isNewAtLocation,
    is_new_business_entity,
    normalized_address_key: addrKey,
  };
}

export interface PriorClosedRecord {
  row: Record<string, unknown>;
  locationEnd: Date;
  addressKey: string;
}

export interface TransferMatchOptions {
  transferWindowDays?: number;
  sameBrandSimilarity?: number;
}

/**
 * 在同一基址上寻找「旧店结束 → 新店开始」时间序列 + 主体变化（文档 MVP）
 */
export function matchDatasfTransfer(
  activeRow: object,
  candidates: readonly PriorClosedRecord[],
  referenceDate: Date,
  opts: TransferMatchOptions = {},
): Pick<DatasfOpeningSignals, 'transfer_score' | 'transfer_label' | 'reason_codes'> & {
  matched_prior: boolean;
} {
  const activeRowR = activeRow as Record<string, unknown>;
  const window = opts.transferWindowDays ?? 120;
  const sameBrand = opts.sameBrandSimilarity ?? 0.8;

  const locStart = parseDay(activeRowR.location_start_date);
  if (!locStart || candidates.length === 0) {
    return {
      transfer_score: 0,
      transfer_label: 'none',
      reason_codes: [],
      matched_prior: false,
    };
  }

  const activeOwner = normalizeOrgName(pickText(activeRowR.ownership_name));
  const activeCert = pickText(activeRowR.certificate_number);
  const activeDbaN = normalizeOrgName(pickText(activeRowR.dba_name));
  const activeKey = normalizedBaseAddressKey(pickText(activeRowR.full_business_address));

  let best:
    | {
        old: PriorClosedRecord;
        gap: number;
      }
    | undefined;

  for (const c of candidates) {
    if (c.addressKey !== activeKey) continue;
    const gap = daysDiff(locStart, c.locationEnd);
    if (gap < 0 || gap > window) continue;
    if (!best || gap < best.gap) best = { old: c, gap };
  }

  if (!best) {
    return {
      transfer_score: 0,
      transfer_label: 'none',
      reason_codes: [],
      matched_prior: false,
    };
  }

  const reasons: OpeningReasonCode[] = ['MATCHED_PRIOR_CLOSED_RECORD_AT_SAME_ADDRESS'];
  let tscore = 0;

  if (best.gap <= 30) {
    tscore += 35;
    reasons.push('SHORT_GAP_BETWEEN_OLD_END_AND_NEW_START');
  } else if (best.gap <= 60) tscore += 25;
  else if (best.gap <= 120) tscore += 15;

  const oldRow = best.old.row;
  const oldOwner = normalizeOrgName(pickText(oldRow.ownership_name));
  const oldCert = pickText(oldRow.certificate_number);
  const oldDbaN = normalizeOrgName(pickText(oldRow.dba_name));

  const ownerJ = tokenJaccard(activeOwner, oldOwner);
  const dbaJ = tokenJaccard(activeDbaN, oldDbaN);

  let ownerChanged = activeOwner && oldOwner && ownerJ < sameBrand;
  const certChanged =
    !!activeCert &&
    !!oldCert &&
    activeCert !== oldCert;

  if (ownerChanged) {
    tscore += 25;
    reasons.push('OWNER_NAME_CHANGED');
  }
  if (certChanged) {
    tscore += 20;
    reasons.push('BUSINESS_ACCOUNT_CHANGED');
  }
  if (dbaJ < 0.55 && activeDbaN && oldDbaN) {
    tscore += 15;
    reasons.push('DBA_NAME_CHANGED');
  }

  if (isFoodServiceNaics(activeRowR) && isFoodServiceNaics(oldRow)) {
    tscore += 10;
    reasons.push('SAME_INDUSTRY_CONTINUES_AT_ADDRESS');
  }
  if (isRestaurantLic(activeRowR) && isRestaurantLic(oldRow)) {
    tscore += 5;
  }

  if (normalizeAddressForDatasf(pickText(activeRowR.full_business_address)) === normalizeAddressForDatasf(pickText(oldRow.full_business_address))) {
    tscore += 10;
    reasons.push('UNIT_MATCH_CONFIRMED');
  }

  // 减分
  if (dbaJ >= 0.8 && dbaJ < 1) tscore -= 10;
  if (ownerJ >= 0.85 && ownerJ < 1 && !certChanged) tscore -= 10;
  if (best.gap > 180) tscore -= 20;

  // MVP：须有明显主体变化之一
  const mvpOk = ownerChanged || certChanged;
  if (!mvpOk) {
    tscore = Math.min(tscore, 35);
  }

  tscore = Math.max(0, Math.min(100, tscore));

  return {
    transfer_score: tscore,
    transfer_label: mvpOk ? labelFromTransferScore(tscore) : 'weak_signal',
    reason_codes: reasons,
    matched_prior: true,
  };
}

export function indexClosedRecordsByBaseAddress(
  rows: readonly Record<string, unknown>[],
): Map<string, PriorClosedRecord[]> {
  const m = new Map<string, PriorClosedRecord[]>();
  for (const row of rows) {
    const end = parseDay(row.location_end_date);
    if (!end) continue;
    const key = normalizedBaseAddressKey(pickText(row.full_business_address));
    if (!key) continue;
    const rec: PriorClosedRecord = { row, locationEnd: end, addressKey: key };
    const list = m.get(key);
    if (list) list.push(rec);
    else m.set(key, [rec]);
  }
  for (const list of m.values()) {
    list.sort((a, b) => b.locationEnd.getTime() - a.locationEnd.getTime());
  }
  return m;
}

export function mergeOpeningSignals(
  base: ReturnType<typeof computeDatasfNewOpeningIntel>,
  transfer: ReturnType<typeof matchDatasfTransfer>,
): DatasfOpeningSignals {
  let manual: DatasfOpeningSignals['manual_review_priority'] = 'low';
  if (transfer.transfer_label === 'high_confidence_transfer' || transfer.transfer_score >= 70) {
    manual = 'high';
  } else if (transfer.transfer_label === 'likely_transfer' || base.new_opening_label === 'weak_signal') {
    manual = 'medium';
  }

  const reason_codes = [...base.reason_codes, ...transfer.reason_codes];

  return {
    new_opening_score: base.new_opening_score,
    new_opening_label: base.new_opening_label,
    transfer_score: transfer.transfer_score,
    transfer_label: transfer.transfer_label,
    reason_codes,
    is_new_at_location: base.is_new_at_location,
    is_new_business_entity: base.is_new_business_entity,
    normalized_address_key: base.normalized_address_key,
    manual_review_priority: manual,
  };
}
