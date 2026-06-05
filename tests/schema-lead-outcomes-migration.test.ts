import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SQL = readFileSync(
  resolve(__dirname, '..', 'supabase', 'migrations', '20260604000000_lead_outcomes.sql'),
  'utf-8',
).toLowerCase();

describe('20260604000000_lead_outcomes.sql is idempotent', () => {
  it('creates lead_outcomes with IF NOT EXISTS', () => {
    expect(SQL).toMatch(/create table if not exists lead_outcomes/);
  });

  it('uses unique index for one won/lost per lead', () => {
    expect(SQL).toMatch(/create unique index if not exists lead_outcomes_lead_outcome_unique/);
  });
});
