/**
 * Static idempotency checks for lead_evidence migration (no live DB required).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const UP = resolve(__dirname, '..', 'supabase', 'migrations', '20260602000000_lead_evidence.sql');
const sql = readFileSync(UP, 'utf-8').toLowerCase();

function statements(text: string): string[] {
  return text
    .split(/;\s*(?:--[^\n]*\n)?/)
    .map((s) =>
      s
        .split('\n')
        .map((l) => l.replace(/--.*$/, ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((s) => s.length > 0);
}

const stmts = statements(sql);

describe('20260602000000_lead_evidence.sql is idempotent', () => {
  it('creates lead_evidence with IF NOT EXISTS', () => {
    expect(sql).toMatch(/create table if not exists lead_evidence/);
  });

  it('all add column on leads use IF NOT EXISTS', () => {
    const addCols = stmts.filter((s) => /alter table leads add column/.test(s));
    expect(addCols.length).toBeGreaterThan(0);
    for (const s of addCols) {
      expect(s, `stmt: ${s}`).toMatch(/add column if not exists/);
    }
  });

  it('does not create a second lead_contacts table', () => {
    expect(sql).not.toMatch(/create table if not exists lead_contacts/);
  });

  it('indexes use IF NOT EXISTS', () => {
    const idx = stmts.filter((s) => /^create index /.test(s));
    for (const s of idx) {
      expect(s, `stmt: ${s}`).toMatch(/^create index if not exists/);
    }
  });
});
