/** Skip-trace provider input/output (P2). No DB writes in this layer. */

export type SkipTracePhoneType = 'mobile' | 'landline' | 'voip' | 'unknown';

export interface SkipTracePhoneCandidate {
  value: string;
  type: SkipTracePhoneType;
  confidenceRaw: number | null;
  isMobile?: boolean;
  dncFlag?: boolean;
}

export interface SkipTraceEmailCandidate {
  value: string;
  confidenceRaw: number | null;
}

export interface SkipTraceInput {
  personName: string;
  address: string;
  apn?: string;
}

export interface SkipTraceResult {
  phones: SkipTracePhoneCandidate[];
  emails: SkipTraceEmailCandidate[];
  rawPayload: Record<string, unknown> | null;
}

export interface SkipTraceProvider {
  readonly id: string;
  skipTrace(input: SkipTraceInput): Promise<SkipTraceResult>;
}

export class SkipTraceError extends Error {
  constructor(
    message: string,
    readonly code: 'timeout' | 'rate_limit' | 'auth' | 'parse' | 'upstream' | 'config',
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SkipTraceError';
  }
}
