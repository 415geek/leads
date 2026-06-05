import { describe, expect, it } from 'vitest';
import { resolveLegalEntitySearchQuery } from '@/lib/identity/entity-search-query';

describe('resolveLegalEntitySearchQuery', () => {
  it('uses DataSF ownership_name instead of DBA', () => {
    expect(
      resolveLegalEntitySearchQuery({
        lead_id: 'x',
        name: 'Dumpling Patio',
        source: 'sf_gov',
        source_raw: {
          ownership_name: 'Original Buffalo Wings Inc.',
          dba_name: 'Dumpling Patio',
        },
      }),
    ).toBe('Original Buffalo Wings Inc.');
  });
});
