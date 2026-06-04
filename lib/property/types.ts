/** Property / parcel lookup (P4). Writes lead_evidence only at API layer. */

export interface PropertyPermit {
  type: string;
  /** ISO date or YYYY-MM-DD */
  date: string;
}

export interface PropertyLookupInput {
  address: string;
  apn?: string;
  city?: string;
}

export interface PropertyLookupResult {
  apn: string | null;
  /** Assessor / deed owner — landlord, not restaurant operator */
  propertyOwnerName: string | null;
  normalizedAddress: string | null;
  permits: PropertyPermit[];
  rawPayload: Record<string, unknown> | null;
}

export interface PropertyProvider {
  readonly id: string;
  lookup(input: PropertyLookupInput): Promise<PropertyLookupResult>;
}

export class PropertyError extends Error {
  constructor(
    message: string,
    readonly code: 'timeout' | 'rate_limit' | 'auth' | 'parse' | 'upstream' | 'config',
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PropertyError';
  }
}
