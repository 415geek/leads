'use client';

import { useState, type FormEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PdlPersonHit } from '@/lib/pdl/person-search';
import type {
  DeepPersonIntelResult,
  DeepIntelContact,
} from '@/lib/intel/deep-person-intel';
import { useTranslations } from '@/lib/i18n';

interface DeepIntelState {
  loading: boolean;
  error: string | null;
  result: DeepPersonIntelResult | null;
}

function emptyDeepIntelState(): DeepIntelState {
  return { loading: false, error: null, result: null };
}

function confidenceColor(pct: number): string {
  if (pct >= 80) return 'bg-emerald-100 text-emerald-800';
  if (pct >= 50) return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-700';
}

function ContactList({
  title,
  items,
  emptyHint,
}: {
  title: string;
  items: DeepIntelContact[];
  emptyHint: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">{emptyHint}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((c, idx) => (
            <li
              key={`${c.value}-${idx}`}
              className="flex flex-wrap items-center gap-2 text-sm"
            >
              <span className="font-medium text-slate-800 break-all">{c.value}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${confidenceColor(c.confidence)}`}
              >
                {c.confidence}%
              </span>
              <a
                href={c.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#1e3a5f] underline underline-offset-2"
              >
                来源 ↗
              </a>
              {c.note && (
                <span className="text-xs text-slate-500">— {c.note}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DeepIntelPanel({
  state,
  onRetry,
}: {
  state: DeepIntelState;
  onRetry: () => void;
}) {
  const { loading, error, result } = state;
  if (loading) {
    return (
      <div className="mt-3 rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-600">
        正在调用 Tavily 搜索 + Claude 交叉验证，约需 10–25 秒…
      </div>
    );
  }
  if (error) {
    return (
      <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 space-y-2">
        <p>{error}</p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          重试
        </Button>
      </div>
    );
  }
  if (!result) return null;

  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          身份匹配置信度
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${confidenceColor(result.match_confidence)}`}
        >
          {result.match_confidence}%
        </span>
        <span className="text-xs text-slate-500">
          引用 {result.search_snippets_used} 条联网摘要 · 模型 {result.model}
        </span>
      </div>

      {result.summary_zh && (
        <p className="text-sm text-slate-800">{result.summary_zh}</p>
      )}
      {result.rationale_zh && (
        <p className="text-xs text-slate-500 whitespace-pre-line">
          判断依据：{result.rationale_zh}
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <ContactList
          title="邮箱"
          items={result.emails}
          emptyHint="未在公开网页中找到带源邮箱。"
        />
        <ContactList
          title="电话"
          items={result.phones}
          emptyHint="未在公开网页中找到带源电话。"
        />
        <ContactList
          title="地址 / 办公地"
          items={result.addresses}
          emptyHint="未在公开网页中找到带源地址。"
        />
        <ContactList
          title="个人 / 公司网站"
          items={result.websites}
          emptyHint="未找到相关网站。"
        />
        <ContactList
          title="社交账号"
          items={result.socials}
          emptyHint="未找到其它社交账号。"
        />
      </div>

      {result.evidence.length > 0 && (
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer select-none">
            展开全部 {result.evidence.length} 条引用源
          </summary>
          <ul className="mt-2 space-y-1 pl-4 list-disc">
            {result.evidence.map((e, idx) => (
              <li key={`${e.url}-${idx}`} className="break-all">
                <a
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  {e.title || e.url}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function PdlSearchPanel() {
  const { t } = useTranslations();
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [company, setCompany] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [people, setPeople] = useState<PdlPersonHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [deepState, setDeepState] = useState<Record<string, DeepIntelState>>({});

  const canSubmit = [name, region, company].some((v) => v.trim().length >= 2);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    setSearched(true);
    setDeepState({});
    try {
      const res = await fetch('/api/pdl/search', {
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
      setPeople(Array.isArray(json.people) ? json.people : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败');
      setTotal(null);
      setPeople([]);
    } finally {
      setLoading(false);
    }
  };

  const runDeepSearch = async (person: PdlPersonHit) => {
    const key = person.id || person.full_name || '';
    if (!key) return;
    setDeepState((prev) => ({ ...prev, [key]: { loading: true, error: null, result: null } }));
    try {
      const res = await fetch('/api/pdl/deep-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: person.full_name,
          job_title: person.job_title,
          job_company_name: person.job_company_name,
          location_name: person.location_name,
          linkedin_url: person.linkedin_url,
          work_email: person.work_email,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          json.detail ? `${json.error}: ${json.detail}` : json.error || '深度查询失败',
        );
      }
      setDeepState((prev) => ({
        ...prev,
        [key]: { loading: false, error: null, result: json as DeepPersonIntelResult },
      }));
    } catch (err) {
      setDeepState((prev) => ({
        ...prev,
        [key]: {
          loading: false,
          error: err instanceof Error ? err.message : '深度查询失败',
          result: null,
        },
      }));
    }
  };

  return (
    <Card className="border-[#1e3a5f]/20">
      <CardHeader>
        <CardTitle className="text-lg text-[#1e3a5f]">{t.pdl_title}</CardTitle>
        <p className="text-sm font-normal text-muted-foreground">{t.pdl_description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-slate-600">{t.pdl_label_name}</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.pdl_placeholder_name}
                className="mt-1"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">{t.pdl_label_region}</label>
              <Input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder={t.pdl_placeholder_region}
                className="mt-1"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">{t.pdl_label_company}</label>
              <Input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder={t.pdl_placeholder_company}
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
            {loading ? t.pdl_searching : t.pdl_search_button}
          </Button>
        </form>

        {searched && !loading && error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {searched && !loading && !error && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t.pdl_results_summary(total ?? 0, people.length)}
            </p>
            {people.length === 0 ? (
              <p className="text-sm text-slate-600">{t.pdl_no_results}</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border">
                {people.map((person, idx) => {
                  const key = person.id || `${person.full_name}-${idx}`;
                  const deep = deepState[key] ?? emptyDeepIntelState();
                  return (
                    <li key={key} className="p-4 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <p className="font-semibold text-slate-900">
                            {person.full_name || '—'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {[person.job_title, person.job_company_name]
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </p>
                          {person.location_name && (
                            <p className="text-sm text-muted-foreground">
                              {person.location_name}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-3 pt-1 text-sm">
                            {person.work_email && (
                              <a
                                href={`mailto:${person.work_email}`}
                                className="text-[#1e3a5f] underline underline-offset-2"
                              >
                                {person.work_email}
                              </a>
                            )}
                            {person.linkedin_url && (
                              <a
                                href={person.linkedin_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#1e3a5f] underline underline-offset-2"
                              >
                                LinkedIn ↗
                              </a>
                            )}
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={deep.loading || !person.full_name}
                          onClick={() => runDeepSearch(person)}
                        >
                          {deep.loading
                            ? '深度查询中…'
                            : deep.result
                              ? '重新深度查询'
                              : '🔍 全网深度查询'}
                        </Button>
                      </div>
                      <DeepIntelPanel
                        state={deep}
                        onRetry={() => runDeepSearch(person)}
                      />
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
