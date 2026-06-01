import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('houston comptroller SoQL', () => {
  it('does not compare out_of_business_date date column to empty string (Socrata 400)', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/sources/houston-comptroller-sales-tax.ts'),
      'utf8',
    );
    expect(src).toContain('out_of_business_date IS NULL');
    expect(src).not.toMatch(/out_of_business_date\s*=\s*''/);
  });
});
