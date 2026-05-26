/** 线索列表按登记日期（license_date）筛选 */

export type DateRangePreset = 'all' | '7d' | '30d' | '90d' | 'custom';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDateParam(value: string | null | undefined): string | null {
  const s = value?.trim();
  if (!s || !ISO_DATE.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return s;
}

function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 最近 N 个自然日（含今天） */
export function licenseDateRangeForPreset(days: number): { from: string; to: string } {
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  return { from: isoDateLocal(from), to: isoDateLocal(to) };
}

export function resolveLicenseDateQuery(
  preset: DateRangePreset,
  customFrom: string,
  customTo: string,
): { date_from?: string; date_to?: string } {
  if (preset === 'all') return {};
  if (preset === '7d') {
    const { from, to } = licenseDateRangeForPreset(7);
    return { date_from: from, date_to: to };
  }
  if (preset === '30d') {
    const { from, to } = licenseDateRangeForPreset(30);
    return { date_from: from, date_to: to };
  }
  if (preset === '90d') {
    const { from, to } = licenseDateRangeForPreset(90);
    return { date_from: from, date_to: to };
  }
  const from = parseIsoDateParam(customFrom);
  const to = parseIsoDateParam(customTo);
  if (!from && !to) return {};
  if (from && to && from > to) return { date_from: to, date_to: from };
  return {
    ...(from ? { date_from: from } : {}),
    ...(to ? { date_to: to } : {}),
  };
}
