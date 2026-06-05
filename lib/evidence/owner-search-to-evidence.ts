import type { LeadEvidenceInsert } from '@/types/lead-evidence';
import { formatOwnerRecord } from '@/lib/whitepages/format-record';
import type { OwnerKeywordAnalysis } from '@/lib/whitepages/owner-keyword-match';
import type { WhitepagesPersonRecord } from '@/lib/whitepages/owner-search';

const MAX_CANDIDATES = 3;
const MAX_PHONES_PER_CANDIDATE = 4;
const MAX_EMAILS_PER_CANDIDATE = 3;

function recordKey(record: WhitepagesPersonRecord, idx: number): string {
  return typeof record.id === 'string' && record.id.trim()
    ? record.id.trim()
    : `idx-${idx}`;
}

function scoreForRecord(
  record: WhitepagesPersonRecord,
  idx: number,
  analyses: Record<string, OwnerKeywordAnalysis> | undefined,
  keywordAnalysisApplied: boolean,
): number {
  const id = recordKey(record, idx);
  if (keywordAnalysisApplied && analyses?.[id]) {
    return analyses[id].keyword_match_score;
  }
  return typeof record.match_score === 'number' ? record.match_score : 0;
}

/** Whitepages 搜索结果 → lead_evidence 行（事实，不下结论）。 */
export function ownerSearchResultsToEvidence(
  leadId: string,
  results: readonly WhitepagesPersonRecord[],
  opts: {
    analyses?: Record<string, OwnerKeywordAnalysis>;
    keywordAnalysisApplied?: boolean;
    fetchedAt?: string;
  } = {},
): LeadEvidenceInsert[] {
  const fetchedAt = opts.fetchedAt ?? new Date().toISOString();
  const ranked = [...results]
    .map((record, idx) => ({ record, idx, score: scoreForRecord(record, idx, opts.analyses, Boolean(opts.keywordAnalysisApplied)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES);

  const rows: LeadEvidenceInsert[] = [];
  const seenPhone = new Set<string>();
  const seenEmail = new Set<string>();

  for (const { record, idx, score } of ranked) {
    const data = formatOwnerRecord(record);
    const rawPayload = {
      whitepages_id: data.id,
      match_score: data.matchScore,
      keyword_score: opts.keywordAnalysisApplied ? score : null,
      rank: idx,
    };

    if (
      data.name &&
      data.name !== '—' &&
      !rows.some((r) => r.field === 'owner_name' && r.value === data.name)
    ) {
      rows.push({
        lead_id: leadId,
        field: 'owner_name',
        value: data.name,
        source: 'whitepages',
        fetched_at: fetchedAt,
        confidence_raw: score > 0 ? score : data.matchScore,
        raw_payload: rawPayload,
      });
    }

    if (data.companyName) {
      rows.push({
        lead_id: leadId,
        field: 'owner_entity',
        value: data.companyName,
        source: 'whitepages',
        fetched_at: fetchedAt,
        confidence_raw: score > 0 ? score : data.matchScore,
        raw_payload: rawPayload,
      });
    }

    for (const phone of data.phones.slice(0, MAX_PHONES_PER_CANDIDATE)) {
      const norm = phone.number.replace(/\D/g, '');
      if (!norm || seenPhone.has(norm)) continue;
      seenPhone.add(norm);
      rows.push({
        lead_id: leadId,
        field: 'phone',
        value: phone.number,
        source: 'whitepages',
        fetched_at: fetchedAt,
        confidence_raw: phone.score ?? data.matchScore,
        raw_payload: {
          ...rawPayload,
          type: phone.type ?? null,
          isMobile: phone.type?.toLowerCase().includes('mobile') ?? false,
        },
      });
    }

    for (const email of data.emails.slice(0, MAX_EMAILS_PER_CANDIDATE)) {
      const norm = email.trim().toLowerCase();
      if (!norm || seenEmail.has(norm)) continue;
      seenEmail.add(norm);
      rows.push({
        lead_id: leadId,
        field: 'email',
        value: email,
        source: 'whitepages',
        fetched_at: fetchedAt,
        confidence_raw: data.matchScore,
        raw_payload: rawPayload,
      });
    }
  }

  if (opts.analyses && opts.keywordAnalysisApplied) {
    for (const analysis of Object.values(opts.analyses)) {
      for (const ev of analysis.evidence.slice(0, 2)) {
        if (/opencorporates|sos|bizfile|registry/i.test(ev.url)) {
          rows.push({
            lead_id: leadId,
            field: 'owner_entity',
            value: ev.title.slice(0, 200) || ev.url,
            source: 'opencorporates',
            fetched_at: fetchedAt,
            confidence_raw: analysis.keyword_match_score,
            raw_payload: { url: ev.url, title: ev.title },
          });
        }
      }
    }
  }

  return rows;
}
