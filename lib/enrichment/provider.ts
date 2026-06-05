import type { LeadEvidenceSource } from '@/types/lead-evidence';
import { BatchDataProvider, MockSkipTraceProvider } from './batchdata';
import type { SkipTraceProvider, SkipTraceResult } from './types';
import { SkipTraceError } from './types';
import { WhitepagesSkipTraceProvider } from './whitepages';

export type SkipTraceProviderId = 'batchdata' | 'mock' | 'whitepages';

export function getSkipTraceProviderId(): SkipTraceProviderId {
  const raw = (process.env.SKIP_TRACE_PROVIDER ?? 'batchdata').trim().toLowerCase();
  if (raw === 'mock') return 'mock';
  if (raw === 'whitepages') return 'whitepages';
  return 'batchdata';
}

export function skipTraceEvidenceSource(id: SkipTraceProviderId): LeadEvidenceSource {
  if (id === 'whitepages') return 'whitepages';
  if (id === 'mock') return 'batchdata';
  return 'batchdata';
}

export function getSkipTraceProvider(fixture?: SkipTraceResult): SkipTraceProvider {
  const id = getSkipTraceProviderId();
  if (id === 'whitepages') {
    try {
      return new WhitepagesSkipTraceProvider();
    } catch (err) {
      if (err instanceof SkipTraceError && err.code === 'config') throw err;
      throw new SkipTraceError('Failed to initialize Whitepages skip-trace provider', 'config', err);
    }
  }
  if (id === 'mock') {
    return new MockSkipTraceProvider(
      fixture ?? {
        phones: [{ value: '5550100', type: 'mobile', confidenceRaw: 0.82, isMobile: true }],
        emails: [{ value: 'owner@example.com', confidenceRaw: 0.7 }],
        rawPayload: { mock: true },
      },
    );
  }
  try {
    return new BatchDataProvider();
  } catch (err) {
    if (err instanceof SkipTraceError && err.code === 'config') {
      throw err;
    }
    throw new SkipTraceError('Failed to initialize skip-trace provider', 'config', err);
  }
}
