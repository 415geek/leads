import type { WhitepagesPersonRecord } from '@/lib/whitepages/owner-search';

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object' && 'name' in item) {
        return asString((item as { name?: unknown }).name);
      }
      return null;
    })
    .filter((s): s is string => Boolean(s));
}

export function formatAddress(value: unknown): string | null {
  const direct = asString(value);
  if (direct) return direct;

  if (!value || typeof value !== 'object') return null;
  const addr = value as Record<string, unknown>;

  if (typeof addr.address === 'string' && addr.address.trim()) {
    return addr.address.trim();
  }

  const parts = [
    addr.street_line_1,
    addr.street_line_2,
    addr.city,
    addr.state_code ?? addr.state,
    addr.postal_code ?? addr.zipcode,
  ]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : null;
}

export function extractAddresses(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => formatAddress(item))
    .filter((s): s is string => Boolean(s));
}

export interface FormattedPhone {
  number: string;
  type?: string;
  score?: number;
}

export function extractPhones(record: WhitepagesPersonRecord): FormattedPhone[] {
  const phones = record.phones;
  if (!Array.isArray(phones)) return [];

  const out: FormattedPhone[] = [];
  for (const item of phones) {
    if (!item || typeof item !== 'object') continue;
    const phone = item as Record<string, unknown>;
    const number = asString(phone.number ?? phone.phone_number);
    if (!number) continue;
    const type = asString(phone.type) ?? undefined;
    const score = typeof phone.score === 'number' ? phone.score : undefined;
    out.push({ number, type, score });
  }
  return out;
}

export function extractEmails(record: WhitepagesPersonRecord): string[] {
  const emails = record.emails;
  if (!Array.isArray(emails)) return [];

  return emails
    .map((item) => {
      if (typeof item === 'string') return asString(item);
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        return asString(obj.email ?? obj.address);
      }
      return null;
    })
    .filter((s): s is string => Boolean(s));
}

export interface OwnerCardData {
  id: string | null;
  name: string;
  matchScore: number | null;
  aliases: string[];
  companyName: string | null;
  jobTitle: string | null;
  phones: FormattedPhone[];
  emails: string[];
  currentAddresses: string[];
  historicAddresses: string[];
  ownedProperties: string[];
  linkedinUrl: string | null;
  dateOfBirth: string | null;
  relatives: string[];
  isDead: boolean;
  matchedBy: string | null;
}

export function formatOwnerRecord(record: WhitepagesPersonRecord): OwnerCardData {
  return {
    id: asString(record.id),
    name: asString(record.name) ?? '—',
    matchScore: typeof record.match_score === 'number' ? record.match_score : null,
    aliases: asStringArray(record.aliases),
    companyName: asString(record.company_name),
    jobTitle: asString(record.job_title),
    phones: extractPhones(record),
    emails: extractEmails(record),
    currentAddresses: extractAddresses(record.current_addresses),
    historicAddresses: extractAddresses(record.historic_addresses),
    ownedProperties: extractAddresses(record.owned_properties),
    linkedinUrl: asString(record.linkedin_url),
    dateOfBirth: asString(record.date_of_birth),
    relatives: asStringArray(record.relatives).slice(0, 5),
    isDead: record.is_dead === true,
    matchedBy: asString(record.matched_by),
  };
}
