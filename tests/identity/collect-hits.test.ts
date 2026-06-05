import { describe, expect, it } from 'vitest';
import { collectIdentityHits } from '@/lib/identity/collect-hits';

describe('collectIdentityHits / hitsFromSourceRaw', () => {
  it('maps DataSF ownership_name to entity, not DBA as person', async () => {
    const hits = await collectIdentityHits(
      {
        lead_id: 'x',
        name: 'Dumpling Patio',
        source: 'sf_gov',
        source_raw: {
          ownership_name: 'Original Buffalo Wings Inc.',
          dba_name: 'Dumpling Patio',
        },
      },
      { skipOc: true },
    );

    expect(hits).toHaveLength(1);
    expect(hits[0]?.entityName).toBe('Original Buffalo Wings Inc.');
    expect(hits[0]?.personName).toBeNull();
    expect(hits[0]?.rawPayload).toEqual({ from: 'ownership_name' });
  });
});
