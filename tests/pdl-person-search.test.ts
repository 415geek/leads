import { describe, expect, it } from 'vitest';
import {
  buildPdlSearchSql,
  escapePdlSqlLiteral,
  normalizePdlPerson,
} from '@/lib/pdl/person-search';

describe('buildPdlSearchSql', () => {
  it('builds AND clauses for multiple fields', () => {
    const sql = buildPdlSearchSql({
      name: 'Jane Doe',
      company: 'Acme',
      region: 'California',
    });
    expect(sql).toContain('full_name LIKE');
    expect(sql).toContain('job_company_name LIKE');
    expect(sql).toContain('location_region LIKE');
    expect(sql).toMatch(/WHERE .+ AND .+ AND/);
  });

  it('escapes single quotes', () => {
    const sql = buildPdlSearchSql({ name: "O'Brien" });
    expect(sql).toContain("O''Brien");
  });

  it('returns null when empty', () => {
    expect(buildPdlSearchSql({})).toBeNull();
  });
});

describe('normalizePdlPerson', () => {
  it('extracts core fields', () => {
    const hit = normalizePdlPerson({
      id: 'abc',
      full_name: 'Test User',
      job_title: 'Owner',
      job_company_name: 'Cafe',
      location_name: 'Oakland, CA',
      linkedin_url: 'https://linkedin.com/in/test',
      work_email: 'test@example.com',
    });
    expect(hit.full_name).toBe('Test User');
    expect(hit.work_email).toBe('test@example.com');
  });
});

describe('escapePdlSqlLiteral', () => {
  it('escapes quotes and backslashes', () => {
    expect(escapePdlSqlLiteral("a'b\\c")).toBe("a''b\\\\c");
  });
});
