import { fetchJsonWithTimeout, type FetchImpl } from './http';
import type {
  PropertyLookupInput,
  PropertyLookupResult,
  PropertyPermit,
  PropertyProvider,
} from './types';
import { PropertyError } from './types';

/** ATTOM property detail subset (v1 gateway). */
interface AttomBuildingPermit {
  permitType?: string;
  permitDate?: string;
  effectiveDate?: string;
}

interface AttomProperty {
  identifier?: { apn?: string; attomId?: number };
  address?: { oneLine?: string; line1?: string; locality?: string };
  summary?: { propclass?: string };
  building?: { permits?: AttomBuildingPermit[] };
  sale?: { buyerName?: string };
  assessment?: { owner?: { owner1?: { fullname?: string } } };
}

interface AttomResponse {
  property?: AttomProperty[];
  status?: { code?: number; msg?: string };
}

function mapPermits(property: AttomProperty): PropertyPermit[] {
  const raw = property.building?.permits ?? [];
  const out: PropertyPermit[] = [];
  for (const p of raw) {
    const date = (p.permitDate ?? p.effectiveDate ?? '').trim();
    const type = (p.permitType ?? 'permit').trim();
    if (!date) continue;
    out.push({ type, date });
  }
  return out;
}

function ownerFromProperty(property: AttomProperty): string | null {
  const o = property.assessment?.owner?.owner1?.fullname?.trim();
  if (o) return o;
  const buyer = property.sale?.buyerName?.trim();
  return buyer || null;
}

export interface AttomProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: FetchImpl;
}

/**
 * ATTOM property detail adapter. Requires ATTOM_API_KEY for live calls.
 */
export class AttomProvider implements PropertyProvider {
  readonly id = 'attom';

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchImpl;

  constructor(opts: AttomProviderOptions = {}) {
    const key = opts.apiKey ?? process.env.ATTOM_API_KEY?.trim();
    if (!key) {
      throw new PropertyError('ATTOM_API_KEY is not configured', 'config');
    }
    this.apiKey = key;
    this.baseUrl = (opts.baseUrl ?? process.env.ATTOM_API_BASE_URL ?? 'https://api.gateway.attomdata.com').replace(
      /\/$/,
      '',
    );
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async lookup(input: PropertyLookupInput): Promise<PropertyLookupResult> {
    const address = input.address.trim();
    if (!address) {
      throw new PropertyError('address is required', 'config');
    }

    const params = new URLSearchParams({ address });
    if (input.apn?.trim()) params.set('apn', input.apn.trim());
    if (input.city?.trim()) params.set('locality', input.city.trim());

    const url = `${this.baseUrl}/propertyapi/v1.0.0/property/detail?${params.toString()}`;

    const { body } = await fetchJsonWithTimeout(
      url,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          apikey: this.apiKey,
        },
        timeoutMs: 14_000,
      },
      this.fetchImpl,
    );

    const json = body as AttomResponse;
    const property = json.property?.[0];
    if (!property) {
      return {
        apn: input.apn?.trim() || null,
        propertyOwnerName: null,
        normalizedAddress: address,
        permits: [],
        rawPayload: json as Record<string, unknown>,
      };
    }

    return {
      apn: property.identifier?.apn?.trim() || input.apn?.trim() || null,
      propertyOwnerName: ownerFromProperty(property),
      normalizedAddress: property.address?.oneLine?.trim() || property.address?.line1?.trim() || address,
      permits: mapPermits(property),
      rawPayload: property as Record<string, unknown>,
    };
  }
}

/** Deterministic fixture for tests and staging without ATTOM billing. */
export class MockPropertyProvider implements PropertyProvider {
  readonly id = 'mock';

  constructor(private readonly fixture: PropertyLookupResult) {}

  async lookup(_input: PropertyLookupInput): Promise<PropertyLookupResult> {
    return { ...this.fixture, rawPayload: { ...(this.fixture.rawPayload ?? {}), mock: true } };
  }
}
