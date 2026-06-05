import { extractEmails, extractPhones } from '@/lib/whitepages/format-record';
import {
  searchWhitepagesOwners,
  type WhitepagesPersonRecord,
} from '@/lib/whitepages/owner-search';
import type {
  SkipTraceEmailCandidate,
  SkipTraceInput,
  SkipTracePhoneCandidate,
  SkipTraceProvider,
  SkipTraceResult,
} from './types';
import { SkipTraceError } from './types';

function mapPhoneType(raw: string | undefined): SkipTracePhoneCandidate['type'] {
  const t = (raw ?? '').toLowerCase();
  if (t.includes('mobile') || t.includes('cell')) return 'mobile';
  if (t.includes('land')) return 'landline';
  if (t.includes('voip')) return 'voip';
  return 'unknown';
}

function pickBestRecord(results: readonly WhitepagesPersonRecord[]): WhitepagesPersonRecord | null {
  if (!results.length) return null;
  let best = results[0]!;
  let bestScore = typeof best.match_score === 'number' ? best.match_score : -1;
  for (const r of results.slice(1)) {
    const s = typeof r.match_score === 'number' ? r.match_score : -1;
    if (s > bestScore) {
      best = r;
      bestScore = s;
    }
  }
  return best;
}

export function whitepagesRecordToSkipTrace(record: WhitepagesPersonRecord): SkipTraceResult {
  const phones: SkipTracePhoneCandidate[] = [];
  for (const p of extractPhones(record)) {
    const type = mapPhoneType(p.type);
    const confidenceRaw =
      typeof p.score === 'number' ? Math.max(0, Math.min(1, p.score / 100)) : null;
    phones.push({
      value: p.number,
      type,
      confidenceRaw,
      isMobile: type === 'mobile',
    });
  }

  const emails: SkipTraceEmailCandidate[] = extractEmails(record).map((value) => ({
    value,
    confidenceRaw: null,
  }));

  return {
    phones,
    emails,
    rawPayload: { whitepages_id: record.id ?? null, match_score: record.match_score ?? null },
  };
}

export interface WhitepagesSkipTraceProviderOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Whitepages Pro Person Search（替代 BatchData skip-trace）。
 * 需 WHITEPAGES_PRO_API_KEY；与 /api/owner/search 同源。
 */
export class WhitepagesSkipTraceProvider implements SkipTraceProvider {
  readonly id = 'whitepages';

  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: WhitepagesSkipTraceProviderOptions = {}) {
    const key = opts.apiKey ?? process.env.WHITEPAGES_PRO_API_KEY?.trim();
    if (!key) {
      throw new SkipTraceError('WHITEPAGES_PRO_API_KEY is not configured', 'config');
    }
    this.apiKey = key;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async skipTrace(input: SkipTraceInput): Promise<SkipTraceResult> {
    const personName = input.personName.trim();
    const address = input.address.trim();
    if (!personName || !address) {
      throw new SkipTraceError('personName and address are required', 'config');
    }

    try {
      const { results } = await searchWhitepagesOwners(
        this.apiKey,
        { name: personName, address },
        this.fetchImpl,
      );
      const best = pickBestRecord(results);
      if (!best) {
        return { phones: [], emails: [], rawPayload: { empty: true } };
      }
      return whitepagesRecordToSkipTrace(best);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'EMPTY_QUERY') {
        throw new SkipTraceError('Whitepages query invalid (name/address)', 'config', err);
      }
      if (msg.startsWith('WP_401') || msg.startsWith('WP_403')) {
        throw new SkipTraceError(msg, 'auth', err);
      }
      if (msg.startsWith('WP_429')) {
        throw new SkipTraceError(msg, 'rate_limit', err);
      }
      throw new SkipTraceError(`Whitepages skip-trace failed: ${msg}`, 'upstream', err);
    }
  }
}
