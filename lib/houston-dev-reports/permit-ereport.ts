/**
 * City of Houston Planning — Weekly Permit "Web eReport" (.xlsx) from
 * https://www.houstontx.gov/planning/DevelopRegs/dev_reports-archives.html
 *
 * Parses the newest few weekly workbooks and keeps rows whose Comments / Permit Type
 * look food-service related (restaurant, bar, cafe, etc.).
 */

import * as XLSX from 'xlsx';
import { calculateLeadScore } from '@/lib/scoring';
import type { Lead } from '@/types/lead';
import {
  buildCuisineLabel,
  pickText,
  snapshotSourceRaw,
  type FoodLeadDraft,
  type SourceFetchResult,
} from '@/lib/bay-area-food-import/shared';

export const HOUSTON_PERMIT_EREPORT_SOURCE_ID = 'houston_permit_ereport';
export const HOUSTON_DEV_REPORTS_ARCHIVE_URL =
  'https://www.houstontx.gov/planning/DevelopRegs/dev_reports-archives.html';
const ARCHIVE_ORIGIN = 'https://www.houstontx.gov/planning/DevelopRegs/';

const FETCH_UA =
  'Mozilla/5.0 (compatible; RestaurantLeadsFinder/1.0; +https://leads.maxwelllai.com)';

const MAX_WEEKLY_FILES = 3;
const MAX_LEADS_TOTAL = 200;

const FOOD_PERMIT_RE =
  /restaurant|restaurants|\bbar\b|\bcafe\b|food\s*service|kitchen|tavern|lounge|bakery|grill|diner|brewery|eatery|dining|pizzeria|coffee\s*shop|cafeteria|bistro|\bpub\b|taproom|winery|distillery|mobile\s*food|catering|eating\s*place|juice\s*bar/i;

function isFoodPermit(comments: string, permitType: string): boolean {
  return FOOD_PERMIT_RE.test(`${comments} ${permitType}`);
}

function extractXlsxHrefs(html: string): string[] {
  const re = /href="(docs_pdfs\/Permit_eReport\/[^"]+\.xlsx)"/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const path = m[1].replace(/&amp;/g, '&');
    out.push(ARCHIVE_ORIGIN + path);
  }
  return [...new Set(out)];
}

function xlsxSortKey(href: string): { year: number; iso: string; href: string } {
  const yearMatch = href.match(/Permit_eReport\/(\d{4})\//);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : 0;
  let iso = '0000-01-01';

  const m1 = href.match(/Web-eReport-Permits-(\d{2})-(\d{2})-(\d{4})\.xlsx/i);
  if (m1) iso = `${m1[3]}-${m1[1]}-${m1[2]}`;

  const m2 = href.match(/(\d{1,2})-(\d{1,2})-(\d{4})_Permits_Web-eReport\.xlsx/i);
  if (m2) {
    const mm = m2[1].padStart(2, '0');
    const dd = m2[2].padStart(2, '0');
    iso = `${m2[3]}-${mm}-${dd}`;
  }

  const m3 = href.match(
    /Web-eReport-Permits-(\d{2})-(\d{2})-(\d{4})-to-(\d{2})-(\d{2})-(\d{4})\.xlsx/i,
  );
  if (m3) iso = `${m3[6]}-${m3[4]}-${m3[5]}`;

  return { year, iso, href };
}

function sortHrefsNewestFirst(hrefs: string[]): string[] {
  const keys = hrefs.map(xlsxSortKey);
  keys.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.iso.localeCompare(a.iso);
  });
  return keys.map((k) => k.href);
}

function permitDateIso(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().split('T')[0];
  }
  if (typeof v === 'string') {
    const d = v.split(/[T ]/)[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + v * 86400000;
    const dt = new Date(ms);
    if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0];
  }
  return null;
}

function buildLeadName(comments: string, projectNo: string, address: string | null): string {
  const c = comments.trim();
  const first = c.split(/[.·]/)[0]?.trim() ?? '';
  if (first.length >= 8) return first.slice(0, 120);
  const addr = (address ?? '').trim();
  if (addr) return `Permit ${projectNo} · ${addr}`.slice(0, 120);
  return `Houston permit ${projectNo}`.slice(0, 120);
}

function projectNoKey(row: Record<string, unknown>): string | null {
  const raw = row['Project No'];
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  return s.length ? s : null;
}

function isNewerPermitDate(prev: string | null, next: string | null): boolean {
  if (!next) return false;
  if (!prev) return true;
  return next > prev;
}

export async function fetchHoustonPermitEreportLeads(opts: {
  sinceDate: string;
}): Promise<{
  result: SourceFetchResult;
  leads: (FoodLeadDraft & { lead_score: number })[];
}> {
  const id = HOUSTON_PERMIT_EREPORT_SOURCE_ID;
  const label =
    'Houston Planning · Weekly Permit Web eReport（dev_reports-archives .xlsx）';

  try {
    const pageRes = await fetch(HOUSTON_DEV_REPORTS_ARCHIVE_URL, {
      headers: {
        'User-Agent': FETCH_UA,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!pageRes.ok) {
      return {
        result: { id, label, ok: false, fetched: 0, error: `archive HTTP ${pageRes.status}` },
        leads: [],
      };
    }

    const html = await pageRes.text();
    const hrefs = extractXlsxHrefs(html);
    if (!hrefs.length) {
      return {
        result: { id, label, ok: false, fetched: 0, error: 'no Permit_eReport .xlsx links' },
        leads: [],
      };
    }

    const newestFirst = sortHrefsNewestFirst(hrefs);
    const toFetch = newestFirst.slice(0, MAX_WEEKLY_FILES);

    const bestByProject = new Map<
      string,
      { draft: FoodLeadDraft; lead_score: number; license_date: string | null }
    >();

    for (const xlsxUrl of toFetch) {
      const binRes = await fetch(xlsxUrl, {
        headers: { 'User-Agent': FETCH_UA, Accept: '*/*' },
      });
      if (!binRes.ok) continue;

      const buf = Buffer.from(await binRes.arrayBuffer());
      const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) continue;

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        range: 4,
        defval: null,
      });

      for (const row of rows) {
        const permitType = pickText(row['Permit Type']) ?? '';
        const comments = pickText(row['Comments']) ?? '';
        if (!isFoodPermit(comments, permitType)) continue;

        const pno = projectNoKey(row);
        if (!pno) continue;

        const licenseDate = permitDateIso(row['Permit Date']);
        if (!licenseDate) continue;
        if (licenseDate < opts.sinceDate) continue;

        const address = pickText(row['Address']);
        const zip = row['Zip Code'];
        const zipPart = zip != null && String(zip).trim() ? String(zip).trim() : '';
        const addrLine = [address, ['Houston', 'TX', zipPart].filter(Boolean).join(' ')].filter(
          Boolean,
        ).join(', ');

        const building = pickText(row['Building Pmt']);
        const name = buildLeadName(comments, pno, address);

        const draft: FoodLeadDraft = {
          name,
          address: addrLine.length ? addrLine : null,
          phone: null,
          cuisine_type: buildCuisineLabel({
            licLine: [permitType, comments].filter(Boolean).join(' · '),
            businessName: name,
          }),
          city: 'Houston',
          source: id,
          license_date: licenseDate,
          license_type: [permitType, building].filter(Boolean).join(' · ') || null,
          source_raw: snapshotSourceRaw({
            ...row,
            _ereport_file_url: xlsxUrl,
            _ereport_portal_url: HOUSTON_DEV_REPORTS_ARCHIVE_URL,
          }),
          lead_status: 'new',
        };

        const lead_score = calculateLeadScore(draft as Partial<Lead>);
        const prev = bestByProject.get(pno);
        if (!prev || isNewerPermitDate(prev.license_date, licenseDate)) {
          bestByProject.set(pno, { draft, lead_score, license_date: licenseDate });
        }
      }
    }

    const leads = Array.from(bestByProject.values())
      .map(({ draft, lead_score }) => ({ ...draft, lead_score }))
      .slice(0, MAX_LEADS_TOTAL);

    return {
      result: { id, label, ok: true, fetched: leads.length },
      leads,
    };
  } catch (e) {
    return {
      result: {
        id,
        label,
        ok: false,
        fetched: 0,
        error: e instanceof Error ? e.message : 'fetch failed',
      },
      leads: [],
    };
  }
}
