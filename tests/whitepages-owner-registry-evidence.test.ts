import { describe, expect, it } from 'vitest';
import {
  buildRegistryWebQueries,
  registrySnippetsBlock,
} from '@/lib/whitepages/owner-registry-evidence';

describe('buildRegistryWebQueries', () => {
  it('includes keywords, name, and address', () => {
    const queries = buildRegistryWebQueries({
      name: 'Tony Lu',
      keywords: 'Lu Kitchen LLC',
      region: 'San Francisco, CA',
      address: '123 Market St, San Francisco, CA 94103',
    });
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.some((q) => q.includes('Lu Kitchen'))).toBe(true);
    expect(queries.some((q) => q.includes('Tony Lu'))).toBe(true);
  });
});

describe('registrySnippetsBlock', () => {
  it('formats registry snippets', () => {
    const block = registrySnippetsBlock([
      {
        title: 'CA SOS Filing',
        url: 'https://bizfileonline.sos.ca.gov/example',
        content: 'Lu Kitchen LLC officer Tony Lu',
      },
    ]);
    expect(block).toContain('[REG-1]');
    expect(block).toContain('bizfileonline');
  });
});
