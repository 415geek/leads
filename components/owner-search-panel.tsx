'use client';

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { OwnerKeywordAnalysis } from '@/lib/whitepages/owner-keyword-match';
import type { WhitepagesPersonRecord, WhitepagesSearchMetadata } from '@/lib/whitepages/owner-search';
import { parseAddressInput } from '@/lib/whitepages/owner-search';
import { formatOwnerRecord } from '@/lib/whitepages/format-record';
import { useTranslations } from '@/lib/i18n';
import type { OwnerSearchInitialValues } from '@/lib/lead-owner-search-defaults';

const RESULTS_PER_PAGE = 5;

function recordKey(record: WhitepagesPersonRecord, idx: number): string {
  return typeof record.id === 'string' && record.id.trim()
    ? record.id.trim()
    : `${typeof record.name === 'string' ? record.name : 'row'}-${idx}`;
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  if (!children) return null;
  return (
    <div className="grid gap-1 sm:grid-cols-[88px_1fr] sm:gap-3">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800">{children}</dd>
    </div>
  );
}

function OwnerResultCard({
  record,
  analysis,
  keywordAnalysisApplied,
}: {
  record: WhitepagesPersonRecord;
  analysis?: OwnerKeywordAnalysis;
  keywordAnalysisApplied: boolean;
}) {
  const { t } = useTranslations();
  const data = formatOwnerRecord(record);
  const roleLine = [data.jobTitle, data.companyName].filter(Boolean).join(' · ');
  const primaryScore = keywordAnalysisApplied && analysis
    ? analysis.keyword_match_score
    : data.matchScore;

  return (
    <article className="rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/80 p-4 shadow-sm">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="min-w-0 space-y-1">
          <h3 className="text-lg font-semibold text-[#1e3a5f]">{data.name}</h3>
          {data.aliases.length > 0 && (
            <p className="text-xs text-slate-500">
              {t.owner_aliases}: {data.aliases.join(' · ')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {primaryScore != null && (
            <Badge
              className={
                keywordAnalysisApplied && analysis
                  ? primaryScore >= 70
                    ? 'bg-emerald-600 text-white hover:bg-emerald-600'
                    : primaryScore >= 40
                      ? 'bg-amber-500 text-white hover:bg-amber-500'
                      : 'bg-slate-500 text-white hover:bg-slate-500'
                  : 'bg-emerald-600 text-white hover:bg-emerald-600'
              }
            >
              {keywordAnalysisApplied && analysis
                ? t.owner_keyword_score(primaryScore)
                : t.owner_match_score(primaryScore)}
            </Badge>
          )}
          {data.isDead && (
            <Badge variant="destructive">{t.owner_deceased}</Badge>
          )}
        </div>
      </header>

      {analysis && (
        <section className="mb-4 space-y-2 rounded-lg border border-[#1e3a5f]/15 bg-[#1e3a5f]/5 p-3">
          <p className="text-sm font-medium text-[#1e3a5f]">{analysis.summary_zh}</p>
          {analysis.matched_signals.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {analysis.matched_signals.map((signal) => (
                <li key={signal}>
                  <Badge variant="outline" className="text-xs font-normal">
                    {signal}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {analysis.rationale_zh && (
            <p className="text-xs leading-relaxed text-slate-600">{analysis.rationale_zh}</p>
          )}
          {analysis.evidence.length > 0 && (
            <div className="space-y-1 pt-1">
              <p className="text-xs font-medium text-slate-500">{t.owner_web_evidence}</p>
              <ul className="space-y-1">
                {analysis.evidence.slice(0, 4).map((ev) => (
                  <li key={ev.url}>
                    <a
                      href={ev.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#1e3a5f] hover:underline"
                    >
                      {ev.title || ev.url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <dl className="space-y-3">
        {roleLine && (
          <FieldRow label={t.owner_work}>
            <span className="font-medium">{roleLine}</span>
          </FieldRow>
        )}

        {data.phones.length > 0 && (
          <FieldRow label={t.owner_phones}>
            <ul className="space-y-1">
              {data.phones.map((phone) => (
                <li key={`${phone.number}-${phone.type ?? ''}`}>
                  <a href={`tel:${phone.number.replace(/\D/g, '')}`} className="text-[#1e3a5f] hover:underline">
                    {phone.number}
                  </a>
                  {phone.type && (
                    <span className="ml-2 text-xs text-slate-500">{phone.type}</span>
                  )}
                </li>
              ))}
            </ul>
          </FieldRow>
        )}

        {data.emails.length > 0 && (
          <FieldRow label={t.owner_emails}>
            <ul className="space-y-1">
              {data.emails.map((email) => (
                <li key={email}>
                  <a href={`mailto:${email}`} className="break-all text-[#1e3a5f] hover:underline">
                    {email}
                  </a>
                </li>
              ))}
            </ul>
          </FieldRow>
        )}

        {data.currentAddresses.length > 0 && (
          <FieldRow label={t.owner_current_address}>
            <ul className="space-y-1">
              {data.currentAddresses.map((addr) => (
                <li key={addr}>{addr}</li>
              ))}
            </ul>
          </FieldRow>
        )}

        {data.ownedProperties.length > 0 && (
          <FieldRow label={t.owner_properties}>
            <ul className="space-y-1">
              {data.ownedProperties.map((addr) => (
                <li key={addr}>{addr}</li>
              ))}
            </ul>
          </FieldRow>
        )}

        {data.historicAddresses.length > 0 && (
          <FieldRow label={t.owner_past_address}>
            <ul className="space-y-1 text-slate-600">
              {data.historicAddresses.slice(0, 3).map((addr) => (
                <li key={addr}>{addr}</li>
              ))}
              {data.historicAddresses.length > 3 && (
                <li className="text-xs text-slate-400">
                  {t.owner_more_addresses(data.historicAddresses.length - 3)}
                </li>
              )}
            </ul>
          </FieldRow>
        )}

        {data.linkedinUrl && (
          <FieldRow label={t.owner_linkedin}>
            <a
              href={data.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-[#1e3a5f] hover:underline"
            >
              {data.linkedinUrl}
            </a>
          </FieldRow>
        )}

        {data.dateOfBirth && (
          <FieldRow label={t.owner_dob}>{data.dateOfBirth}</FieldRow>
        )}

        {data.relatives.length > 0 && (
          <FieldRow label={t.owner_relatives}>
            {data.relatives.join(' · ')}
          </FieldRow>
        )}

        {data.matchedBy && (
          <FieldRow label={t.owner_matched_by}>
            <span className="text-xs text-slate-600">{data.matchedBy}</span>
          </FieldRow>
        )}
      </dl>

      <details className="mt-4 rounded-lg border border-dashed border-slate-200 bg-white">
        <summary className="cursor-pointer select-none px-3 py-2 text-xs text-slate-500">
          {t.owner_raw_json}
        </summary>
        <pre className="max-h-64 overflow-auto border-t border-slate-100 p-3 text-xs leading-relaxed text-slate-700 whitespace-pre-wrap break-all">
          {JSON.stringify(record, null, 2)}
        </pre>
      </details>
    </article>
  );
}

export function OwnerSearchPanel({
  initialValues,
  leadId,
  onPipelineComplete,
  highlight,
}: {
  /** 线索详情等场景：用店名/地址/登记 owner 预填表单 */
  initialValues?: OwnerSearchInitialValues;
  /** 线索 ID：设置后搜索成功会写入 lead_evidence（需 ENABLE_LEAD_EVIDENCE_WRITE=1） */
  leadId?: string;
  /** 证据入库 / 打分后刷新线索档案 */
  onPipelineComplete?: () => void | Promise<void>;
  /** 销售工作流建议走老板搜索时高亮面板 */
  highlight?: boolean;
} = {}) {
  const { t } = useTranslations();
  const [name, setName] = useState(initialValues?.name ?? '');
  const [region, setRegion] = useState(initialValues?.region ?? '');
  const [address, setAddress] = useState(initialValues?.address ?? '');
  const [keywords, setKeywords] = useState(initialValues?.keywords ?? '');
  const [entityName, setEntityName] = useState(initialValues?.entityName ?? '');
  const [caEntityNumber] = useState(initialValues?.caEntityNumber ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [results, setResults] = useState<WhitepagesPersonRecord[]>([]);
  const [analyses, setAnalyses] = useState<Record<string, OwnerKeywordAnalysis>>({});
  const [keywordAnalysisApplied, setKeywordAnalysisApplied] = useState(false);
  const [analysisModel, setAnalysisModel] = useState<string | null>(null);
  const [webSnippetsUsed, setWebSnippetsUsed] = useState<number | null>(null);
  const [registrySnippetsUsed, setRegistrySnippetsUsed] = useState<number | null>(null);
  const [opencorporatesCompaniesFound, setOpencorporatesCompaniesFound] = useState<number | null>(
    null,
  );
  const [metadata, setMetadata] = useState<WhitepagesSearchMetadata | null>(null);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [evidenceNote, setEvidenceNote] = useState<string | null>(null);

  useEffect(() => {
    if (!initialValues || searched) return;
    if (initialValues.name?.trim()) setName(initialValues.name);
    if (initialValues.region?.trim()) setRegion(initialValues.region);
    if (initialValues.address?.trim()) setAddress(initialValues.address);
    if (initialValues.keywords?.trim()) setKeywords(initialValues.keywords);
    if (initialValues.entityName?.trim()) setEntityName(initialValues.entityName);
  }, [initialValues, searched]);

  const canSubmit = useMemo(() => {
    const n = name.trim();
    const r = region.trim();
    const addr = parseAddressInput(address.trim());
    return n.length >= 2 || r.length >= 2 || Boolean(addr.street && addr.street.length >= 3);
  }, [name, region, address]);

  const willCrossValidate = useMemo(() => {
    if (keywords.trim().length >= 2) return true;
    const addr = parseAddressInput(address.trim());
    return Boolean(addr.street && addr.street.length >= 3);
  }, [keywords, address]);

  const totalPages = Math.max(1, Math.ceil(results.length / RESULTS_PER_PAGE));
  const pageResults = useMemo(() => {
    const start = (page - 1) * RESULTS_PER_PAGE;
    return results.slice(start, start + RESULTS_PER_PAGE);
  }, [results, page]);

  const rangeStart = results.length === 0 ? 0 : (page - 1) * RESULTS_PER_PAGE + 1;
  const rangeEnd = Math.min(page * RESULTS_PER_PAGE, results.length);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    setEvidenceNote(null);
    setSearched(true);
    setPage(1);
    try {
      const res = await fetch('/api/owner/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          entityName: entityName.trim() || undefined,
          caEntityNumber: caEntityNumber.trim() || undefined,
          region: region.trim(),
          address: address.trim(),
          keywords: keywords.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.detail ? `${json.error}: ${json.detail}` : json.error || '搜索失败');
      }
      setTotal(typeof json.total === 'number' ? json.total : 0);
      setResults(Array.isArray(json.results) ? json.results : []);
      setAnalyses(json.analyses && typeof json.analyses === 'object' ? json.analyses : {});
      setKeywordAnalysisApplied(Boolean(json.keyword_analysis_applied));
      setAnalysisModel(typeof json.analysis_model === 'string' ? json.analysis_model : null);
      setWebSnippetsUsed(typeof json.web_snippets_used === 'number' ? json.web_snippets_used : null);
      setRegistrySnippetsUsed(
        typeof json.registry_snippets_used === 'number' ? json.registry_snippets_used : null,
      );
      setOpencorporatesCompaniesFound(
        typeof json.opencorporates_companies_found === 'number'
          ? json.opencorporates_companies_found
          : null,
      );
      setMetadata(json.metadata ?? null);

      const loadedResults = Array.isArray(json.results) ? json.results : [];
      const loadedAnalyses =
        json.analyses && typeof json.analyses === 'object'
          ? (json.analyses as Record<string, OwnerKeywordAnalysis>)
          : {};
      const keywordApplied = Boolean(json.keyword_analysis_applied);

      if (leadId && loadedResults.length > 0) {
        void (async () => {
          try {
            const persistRes = await fetch(`/api/leads/${leadId}/persist-owner-search`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                results: loadedResults,
                analyses: loadedAnalyses,
                keyword_analysis_applied: keywordApplied,
              }),
            });
            if (persistRes.status === 503) {
              const persistJson = await persistRes.json().catch(() => ({}));
              const hint =
                typeof persistJson.hint === 'string' ? persistJson.hint : 'ENABLE_LEAD_EVIDENCE_WRITE=1';
              toast.error('证据未入库', { description: hint });
              return;
            }
            const persistJson = await persistRes.json().catch(() => ({}));
            if (!persistRes.ok) {
              const err =
                typeof persistJson.error === 'string' ? persistJson.error : '证据入库失败';
              toast.error(err);
              return;
            }
            const inserted =
              typeof persistJson.evidenceInserted === 'number' ? persistJson.evidenceInserted : 0;
            const contacts =
              typeof persistJson.crossValidate?.contactsUpserted === 'number'
                ? persistJson.crossValidate.contactsUpserted
                : null;
            setEvidenceNote(
              contacts != null && contacts > 0
                ? t.owner_evidence_saved(inserted, contacts)
                : t.owner_evidence_saved(inserted, null),
            );
            toast.success(
              contacts != null && contacts > 0
                ? t.owner_evidence_saved(inserted, contacts)
                : t.owner_evidence_saved(inserted, null),
            );
            await onPipelineComplete?.();
          } catch {
            toast.error('证据入库失败，请稍后重试');
          }
        })();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败');
      setTotal(null);
      setResults([]);
      setAnalyses({});
      setKeywordAnalysisApplied(false);
      setAnalysisModel(null);
      setWebSnippetsUsed(null);
      setRegistrySnippetsUsed(null);
      setOpencorporatesCompaniesFound(null);
      setMetadata(null);
    } finally {
      setLoading(false);
    }
  };

  const loadingLabel = willCrossValidate ? t.owner_searching_with_keywords : t.owner_searching;

  return (
    <Card
      className={
        highlight
          ? 'border-amber-300 ring-2 ring-amber-200/80'
          : 'border-[#1e3a5f]/20'
      }
    >
      <CardHeader>
        <CardTitle className="text-lg text-[#1e3a5f]">{t.owner_title}</CardTitle>
        <p className="text-sm font-normal text-muted-foreground">{t.owner_description}</p>
        {entityName.trim() ? (
          <p className="text-xs text-slate-600">
            法人实体（CA SOS / 登记检索）：<span className="font-medium">{entityName}</span>
            {caEntityNumber.trim() ? (
              <span className="ml-2 text-muted-foreground">#{caEntityNumber}</span>
            ) : null}
            {name.trim() ? (
              <>
                {' '}
                · Whitepages 姓名：<span className="font-medium">{name}</span>
              </>
            ) : (
              ' · 请先点上方「识别」解析高管姓名，或手动填写姓名'
            )}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="text-xs font-medium text-slate-600">{t.owner_label_name}</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.owner_placeholder_name}
                className="mt-1"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">{t.owner_label_region}</label>
              <Input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder={t.owner_placeholder_region}
                className="mt-1"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">{t.owner_label_address}</label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t.owner_placeholder_address}
                className="mt-1"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">{t.owner_label_keywords}</label>
              <Input
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder={t.owner_placeholder_keywords}
                className="mt-1"
                autoComplete="off"
              />
            </div>
          </div>
          <Button
            type="submit"
            disabled={!canSubmit || loading}
            className="bg-[#1e3a5f] hover:bg-[#2d4a6f]"
          >
            {loading ? loadingLabel : t.owner_search_button}
          </Button>
        </form>

        {searched && !loading && error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {evidenceNote && (
          <p className="text-xs text-emerald-800">{evidenceNote}</p>
        )}

        {searched && !loading && !error && (
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                {t.owner_results_summary(total ?? 0, results.length)}
              </p>
              {results.length > 0 && (
                <p className="text-xs text-slate-500">
                  {t.owner_showing_range(rangeStart, rangeEnd, results.length)}
                </p>
              )}
              {keywordAnalysisApplied && (
                <p className="text-xs text-emerald-800">
                  {t.owner_keyword_analysis_note(
                    analysisModel ?? 'Claude',
                    webSnippetsUsed ?? 0,
                    registrySnippetsUsed ?? 0,
                    opencorporatesCompaniesFound ?? 0,
                  )}
                </p>
              )}
            </div>

            {results.length === 0 ? (
              <p className="text-sm text-slate-600">{t.owner_no_results}</p>
            ) : (
              <>
                <div className="grid gap-4">
                  {pageResults.map((record, idx) => {
                    const globalIdx = (page - 1) * RESULTS_PER_PAGE + idx;
                    const key = recordKey(record, globalIdx);
                    return (
                      <OwnerResultCard
                        key={key}
                        record={record}
                        analysis={analyses[key]}
                        keywordAnalysisApplied={keywordAnalysisApplied}
                      />
                    );
                  })}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      {t.prev_page}
                    </Button>
                    <span className="text-sm text-slate-500">
                      {t.page_info(page, totalPages)}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      {t.next_page}
                    </Button>
                  </div>
                )}
              </>
            )}

            {metadata && (
              <details className="text-xs text-slate-500">
                <summary className="cursor-pointer select-none">{t.owner_metadata}</summary>
                <pre className="mt-2 overflow-auto rounded border bg-slate-50 p-2">
                  {JSON.stringify(metadata, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
