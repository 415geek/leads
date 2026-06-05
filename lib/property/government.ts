import type {
  PropertyLookupInput,
  PropertyLookupResult,
  PropertyPermit,
  PropertyProvider,
} from './types';

function strFromRaw(raw: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
}

function dateFromRaw(raw: Record<string, unknown>, keys: readonly string[]): string | null {
  const s = strFromRaw(raw, keys);
  if (!s) return null;
  const iso = s.length >= 10 ? s.slice(0, 10) : s;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

const APN_KEYS = ['apn', 'parcel_id', 'parcel_number', 'parcel', 'tax_account', 'pin', 'folio', 'account_number'] as const;
const OWNER_KEYS = ['property_owner', 'landlord', 'grantee', 'owner_of_record', 'assessed_owner'] as const;

const PERMIT_DATE_KEYS = [
  'permit_date',
  'issue_date',
  'approved_date',
  'license_issue_date',
  'filing_date',
  'permit_issue_date',
  'effective_date',
  'application_date',
  'filed_date',
  'license_date',
] as const;

const PERMIT_TYPE_KEYS = ['permit_type', 'record_type', 'type', 'description', 'work_type', 'permit_description'] as const;

/** 从政府 open-data source_raw 提取 APN / 产权人 / permit 信号（零第三方 API 费）。 */
export function governmentLookupFromSourceRaw(
  input: PropertyLookupInput,
): PropertyLookupResult {
  const raw = input.sourceRaw;
  const address = input.address.trim();
  const permits: PropertyPermit[] = [];

  if (raw && typeof raw === 'object') {
    const type =
      strFromRaw(raw, PERMIT_TYPE_KEYS) ?? 'government_permit';
    const seen = new Set<string>();
    for (const dk of PERMIT_DATE_KEYS) {
      const date = dateFromRaw(raw, [dk]);
      if (!date) continue;
      const key = `${type}::${date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      permits.push({ type, date });
    }
  }

  const apn = input.apn?.trim() || (raw ? strFromRaw(raw, APN_KEYS) : null);
  const propertyOwnerName = raw ? strFromRaw(raw, OWNER_KEYS) : null;
  const normalizedAddress = address || null;

  return {
    apn,
    propertyOwnerName,
    normalizedAddress,
    permits,
    rawPayload: raw ? { ...raw, provider: 'government' } : { provider: 'government', note: 'no_source_raw' },
  };
}

/**
 * 政府 permit / source_raw 地产信号（替代 ATTOM）。
 * 数据来自 ingest 已写入的 source_raw，不发起外部 HTTP。
 */
export class GovernmentPropertyProvider implements PropertyProvider {
  readonly id = 'government';

  async lookup(input: PropertyLookupInput): Promise<PropertyLookupResult> {
    return governmentLookupFromSourceRaw(input);
  }
}
