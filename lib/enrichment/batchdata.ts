import { fetchJsonWithTimeout, type FetchImpl } from './http';
import type {
  SkipTraceInput,
  SkipTraceProvider,
  SkipTraceResult,
  SkipTracePhoneCandidate,
  SkipTraceEmailCandidate,
} from './types';
import { SkipTraceError } from './types';

/** BatchData skip-trace response shape (subset). */
interface BatchDataPerson {
  phones?: Array<{
    number?: string;
    type?: string;
    confidence?: number;
    dnc?: boolean;
  }>;
  emails?: Array<{
    address?: string;
    confidence?: number;
  }>;
}

interface BatchDataResponse {
  results?: { persons?: BatchDataPerson[] };
  person?: BatchDataPerson;
}

function normalizePhoneType(raw: string | undefined): SkipTracePhoneCandidate['type'] {
  const t = (raw ?? '').toLowerCase();
  if (t.includes('mobile') || t === 'cell') return 'mobile';
  if (t.includes('land')) return 'landline';
  if (t.includes('voip')) return 'voip';
  return 'unknown';
}

function mapPerson(person: BatchDataPerson): SkipTraceResult {
  const phones: SkipTracePhoneCandidate[] = [];
  for (const p of person.phones ?? []) {
    const value = (p.number ?? '').trim();
    if (!value) continue;
    const type = normalizePhoneType(p.type);
    phones.push({
      value,
      type,
      confidenceRaw: typeof p.confidence === 'number' ? p.confidence : null,
      isMobile: type === 'mobile',
      dncFlag: Boolean(p.dnc),
    });
  }

  const emails: SkipTraceEmailCandidate[] = [];
  for (const e of person.emails ?? []) {
    const value = (e.address ?? '').trim();
    if (!value) continue;
    emails.push({
      value,
      confidenceRaw: typeof e.confidence === 'number' ? e.confidence : null,
    });
  }

  return { phones, emails, rawPayload: person as Record<string, unknown> };
}

export interface BatchDataProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: FetchImpl;
}

/**
 * BatchData skip-trace adapter. Requires BATCHDATA_API_KEY when used live.
 */
export class BatchDataProvider implements SkipTraceProvider {
  readonly id = 'batchdata';

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchImpl;

  constructor(opts: BatchDataProviderOptions = {}) {
    const key = opts.apiKey ?? process.env.BATCHDATA_API_KEY?.trim() ?? '';
    if (!key) {
      throw new SkipTraceError('BATCHDATA_API_KEY is not configured', 'config');
    }
    this.apiKey = key;
    this.baseUrl = (opts.baseUrl ?? process.env.BATCHDATA_API_BASE_URL ?? 'https://api.batchdata.com').replace(
      /\/$/,
      '',
    );
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async skipTrace(input: SkipTraceInput): Promise<SkipTraceResult> {
    const personName = input.personName?.trim();
    const address = input.address?.trim();
    if (!personName || personName.length < 2) {
      throw new SkipTraceError('personName is required (min 2 chars)', 'upstream');
    }
    if (!address || address.length < 5) {
      throw new SkipTraceError('address is required (min 5 chars)', 'upstream');
    }

    const url = `${this.baseUrl}/api/v1/property/skip-trace`;
    const { body } = await fetchJsonWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          personName,
          address,
          apn: input.apn?.trim() || undefined,
        }),
        timeoutMs: 15_000,
      },
      this.fetchImpl,
    );

    const parsed = body as BatchDataResponse;
    const person =
      parsed.person ??
      parsed.results?.persons?.[0];
    if (!person) {
      return { phones: [], emails: [], rawPayload: parsed as Record<string, unknown> };
    }
    return mapPerson(person);
  }
}

/** Deterministic mock for tests and local dev without API keys. */
export class MockSkipTraceProvider implements SkipTraceProvider {
  readonly id = 'mock';

  constructor(private readonly fixture: SkipTraceResult) {}

  async skipTrace(_input: SkipTraceInput): Promise<SkipTraceResult> {
    return this.fixture;
  }
}

export function parseBatchDataResponse(body: unknown): SkipTraceResult {
  const parsed = body as BatchDataResponse;
  const person = parsed.person ?? parsed.results?.persons?.[0];
  if (!person) {
    return { phones: [], emails: [], rawPayload: (parsed as Record<string, unknown>) ?? null };
  }
  return mapPerson(person);
}
