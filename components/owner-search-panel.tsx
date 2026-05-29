'use client';

import { useState, type FormEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { WhitepagesPersonRecord, WhitepagesSearchMetadata } from '@/lib/whitepages/owner-search';
import { useTranslations } from '@/lib/i18n';

function OwnerRecordFields({ record }: { record: WhitepagesPersonRecord }) {
  const name = typeof record.name === 'string' ? record.name : '—';
  const matchScore = typeof record.match_score === 'number' ? record.match_score : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold text-slate-900">{name}</p>
        {matchScore != null && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
            match_score {matchScore}
          </span>
        )}
        {typeof record.id === 'string' && (
          <span className="font-mono text-xs text-slate-500">{record.id}</span>
        )}
      </div>

      <details open className="rounded-md border border-slate-200 bg-white">
        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
          Whitepages Pro 全部字段（API 原始 JSON）
        </summary>
        <pre className="max-h-[480px] overflow-auto border-t border-slate-200 p-3 text-xs leading-relaxed text-slate-800 whitespace-pre-wrap break-all">
          {JSON.stringify(record, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export function OwnerSearchPanel() {
  const { t } = useTranslations();
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [company, setCompany] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [results, setResults] = useState<WhitepagesPersonRecord[]>([]);
  const [metadata, setMetadata] = useState<WhitepagesSearchMetadata | null>(null);
  const [companyFilterApplied, setCompanyFilterApplied] = useState(false);
  const [searched, setSearched] = useState(false);

  const canSubmit = [name, region, company].some((v) => v.trim().length >= 2);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const res = await fetch('/api/owner/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          region: region.trim(),
          company: company.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.detail ? `${json.error}: ${json.detail}` : json.error || '搜索失败');
      }
      setTotal(typeof json.total === 'number' ? json.total : 0);
      setResults(Array.isArray(json.results) ? json.results : []);
      setMetadata(json.metadata ?? null);
      setCompanyFilterApplied(Boolean(json.company_filter_applied));
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败');
      setTotal(null);
      setResults([]);
      setMetadata(null);
      setCompanyFilterApplied(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-[#1e3a5f]/20">
      <CardHeader>
        <CardTitle className="text-lg text-[#1e3a5f]">{t.owner_title}</CardTitle>
        <p className="text-sm font-normal text-muted-foreground">{t.owner_description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
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
              <label className="text-xs font-medium text-slate-600">{t.owner_label_company}</label>
              <Input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder={t.owner_placeholder_company}
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
            {loading ? t.owner_searching : t.owner_search_button}
          </Button>
        </form>

        {searched && !loading && error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {searched && !loading && !error && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t.owner_results_summary(total ?? 0, results.length)}
            </p>
            {companyFilterApplied && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                {t.owner_company_filter_note}
              </p>
            )}
            {metadata && (
              <details className="text-xs text-slate-500">
                <summary className="cursor-pointer select-none">响应 metadata</summary>
                <pre className="mt-2 overflow-auto rounded border bg-slate-50 p-2">
                  {JSON.stringify(metadata, null, 2)}
                </pre>
              </details>
            )}
            {results.length === 0 ? (
              <p className="text-sm text-slate-600">{t.owner_no_results}</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border">
                {results.map((record, idx) => {
                  const key =
                    (typeof record.id === 'string' ? record.id : null) ??
                    `${typeof record.name === 'string' ? record.name : 'row'}-${idx}`;
                  return (
                    <li key={key} className="p-4">
                      <OwnerRecordFields record={record} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
