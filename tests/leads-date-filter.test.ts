import { describe, expect, it } from 'vitest';
import {
  licenseDateRangeForPreset,
  parseIsoDateParam,
  resolveLicenseDateQuery,
} from '@/lib/leads-date-filter';

describe('parseIsoDateParam', () => {
  it('accepts valid ISO dates', () => {
    expect(parseIsoDateParam('2026-03-01')).toBe('2026-03-01');
  });

  it('rejects invalid dates', () => {
    expect(parseIsoDateParam('2026-02-30')).toBeNull();
    expect(parseIsoDateParam('bad')).toBeNull();
  });
});

describe('resolveLicenseDateQuery', () => {
  it('returns empty for all', () => {
    expect(resolveLicenseDateQuery('all', '', '')).toEqual({});
  });

  it('returns preset window', () => {
    const q = resolveLicenseDateQuery('7d', '', '');
    expect(q.date_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(q.date_to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(q.date_from! <= q.date_to!).toBe(true);
  });

  it('swaps inverted custom range', () => {
    const q = resolveLicenseDateQuery('custom', '2026-03-10', '2026-03-01');
    expect(q).toEqual({ date_from: '2026-03-01', date_to: '2026-03-10' });
  });
});

describe('licenseDateRangeForPreset', () => {
  it('spans inclusive day count', () => {
    const { from, to } = licenseDateRangeForPreset(7);
    const a = new Date(`${from}T12:00:00`);
    const b = new Date(`${to}T12:00:00`);
    const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
    expect(diff).toBe(6);
  });
});
