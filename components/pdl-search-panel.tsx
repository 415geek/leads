'use client';

import { useState, type FormEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PdlPersonHit } from '@/lib/pdl/person-search';
import { useTranslations } from '@/lib/i18n';

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

  const canSubmit = [name, region, company].some((v) => v.trim().length >= 2);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    setSearched(true);
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
                {people.map((person, idx) => (
                  <li
                    key={person.id || `${person.full_name}-${idx}`}
                    className="p-4 space-y-1"
                  >
                    <p className="font-semibold text-slate-900">
                      {person.full_name || '—'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {[person.job_title, person.job_company_name].filter(Boolean).join(' · ') ||
                        '—'}
                    </p>
                    {person.location_name && (
                      <p className="text-sm text-muted-foreground">{person.location_name}</p>
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
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
