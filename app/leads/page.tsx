'use client';

import { useEffect, useState, useCallback, useRef, useMemo, type ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Lead, LeadStatus } from '@/types/lead';
import { ScoreBadge } from '@/components/score-badge';
import { StatusBadge } from '@/components/status-badge';
import { ChainBadge } from '@/components/chain-badge';
import { SourceCountBadge } from '@/components/source-count-badge';
import { toast } from 'sonner';
import Link from 'next/link';
import { dashboardBusinessSearchHref } from '@/lib/dashboard-business-search';
import {
  LEADS_REGION_STORAGE_KEY,
  REGION_OPTIONS,
  type LeadRegionFilterId,
} from '@/lib/region-config';
import { METRO_CONFIGS } from '@/lib/sources/metro-config';
import { useTranslations } from '@/lib/i18n';
import {
  resolveLicenseDateQuery,
  type DateRangePreset,
} from '@/lib/leads-date-filter';

function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ?? 'flex w-full flex-col gap-1 sm:w-auto'}>
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
    </div>
  );
}

export default function LeadsPage() {
  const { t } = useTranslations();

  const STATUS_OPTIONS: { value: LeadStatus | 'all'; label: string }[] = [
    { value: 'all', label: t.status_all },
    { value: 'new', label: t.status_new },
    { value: 'contacted', label: t.status_contacted },
    { value: 'in_progress', label: t.status_in_progress },
    { value: 'converted', label: t.status_converted },
    { value: 'not_interested', label: t.status_not_interested },
  ];

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [cityFilter, setCityFilter] = useState('');
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [region, setRegion] = useState<LeadRegionFilterId>(
    (REGION_OPTIONS[0]?.id ?? 'sf_bay') as LeadRegionFilterId,
  );
  const [chineseOnly, setChineseOnly] = useState(false);
  const [hideChains, setHideChains] = useState(false);
  const [minConfidence, setMinConfidence] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRangePreset>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const regionHydrated = useRef(false);

  const licenseDateQuery = useMemo(
    () => resolveLicenseDateQuery(dateRange, dateFrom, dateTo),
    [dateRange, dateFrom, dateTo],
  );

  const dateRangeLabel = useMemo(() => {
    const map: Record<DateRangePreset, string> = {
      all: t.date_range_all,
      '7d': t.date_range_7d,
      '30d': t.date_range_30d,
      '90d': t.date_range_90d,
      custom: t.date_range_custom,
    };
    return map[dateRange];
  }, [dateRange, t]);

  const confidenceLabel = useMemo(() => {
    const map: Record<string, string> = {
      all: t.filter_unlimited,
      '0.6': t.confidence_06,
      '0.8': t.confidence_08,
      '0.9': t.confidence_09,
    };
    return map[minConfidence] ?? t.filter_unlimited;
  }, [minConfidence, t]);

  const importLabel =
    region === 'all'
      ? t.import_all
      : t.lang_toggle === 'EN'
        ? `Import from ${METRO_CONFIGS.find((m) => m.id === region)?.shortLabel ?? region} Open Data`
        : `从${METRO_CONFIGS.find((m) => m.id === region)?.shortLabel ?? region}开放数据导入`;

  const [importProgress, setImportProgress] = useState<{ done: number; total: number; current?: string } | null>(null);

  /**
   * 导入流程：
   *   - region='all' 时：先 GET ?listSources=1 拿源 id → 逐个 POST {sourceId} → 每成功一个就刷表 + toast 进度
   *   - region=specific 时：直接 POST {metro} 一次
   * 关键：每个请求只处理一个源，避免 Vercel 函数超时（旧版 metro=all 同步跑 6 源导致 504）
   */
  const handleImport = async () => {
    setImporting(true);
    setImportProgress(null);
    try {
      let sourceIds: string[] = [];

      if (region === 'all') {
        // 先拿源列表
        const listRes = await fetch('/api/leads/import?listSources=1');
        const listJson = await listRes.json();
        sourceIds = Array.isArray(listJson.sourceIds) ? listJson.sourceIds : [];
        if (sourceIds.length === 0) {
          toast.error('没有启用的数据源');
          return;
        }
      }

      const totalImported: { imported: number; byId: Record<string, { ok: boolean; imported?: number; fetched?: number; error?: string }> } = {
        imported: 0,
        byId: {},
      };

      if (region === 'all') {
        setImportProgress({ done: 0, total: sourceIds.length });
        let hintShown = false;
        for (let i = 0; i < sourceIds.length; i++) {
          const id = sourceIds[i];
          setImportProgress({ done: i, total: sourceIds.length, current: id });
          try {
            const response = await fetch('/api/leads/import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sourceId: id }),
            });
            const result = await response.json();
            const srcRow = Array.isArray(result.sources) ? result.sources[0] : null;
            const ok = result.success && srcRow?.ok !== false;
            totalImported.imported += typeof result.imported === 'number' ? result.imported : 0;
            totalImported.byId[id] = {
              ok,
              imported: result.imported,
              fetched: srcRow?.fetched,
              error: ok ? undefined : result.error ?? srcRow?.error ?? 'fail',
            };
            if (result.hint && !hintShown) {
              toast.info(`提示：${result.hint}`, { duration: 10000 });
              hintShown = true;
            }
            if (ok) {
              toast.success(`${id}：新增 ${result.imported ?? 0}（抓取 ${srcRow?.fetched ?? 0}）`, { duration: 3000 });
              fetchLeads();
            } else {
              toast.error(`${id}：${totalImported.byId[id].error}`, { duration: 6000 });
            }
          } catch (err) {
            totalImported.byId[id] = { ok: false, error: err instanceof Error ? err.message : 'network' };
            toast.error(`${id}：网络错误`, { duration: 6000 });
          }
        }
        setImportProgress({ done: sourceIds.length, total: sourceIds.length });

        const okList = Object.entries(totalImported.byId).filter(([, v]) => v.ok).map(([k, v]) => `${k}:${v.imported ?? 0}`);
        const failList = Object.entries(totalImported.byId).filter(([, v]) => !v.ok).map(([k, v]) => `${k}:${v.error ?? 'fail'}`);
        toast.success(
          `全部启用城市完成 — 共新增 ${totalImported.imported} 条 ✓[${okList.join(', ')}]${failList.length ? ` ✗[${failList.join(', ')}]` : ''}`,
          { duration: 10000 },
        );
      } else {
        // 单 metro：后端跑该 metro 的所有源（通常 1–2 个）
        const response = await fetch('/api/leads/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metro: region }),
        });
        const result = await response.json();
        const srcList: Array<{ id?: string; ok?: boolean; fetched?: number; error?: string }> =
          Array.isArray(result.sources) ? result.sources : [];
        const okParts = srcList.filter((s) => s.ok).map((s) => `${s.id}:${s.fetched ?? 0}`);
        const failParts = srcList.filter((s) => !s.ok).map((s) => `${s.id}:${s.error ?? 'fail'}`);

        if (result.success) {
          const srcOk = okParts.length ? ` ✓[${okParts.join(', ')}]` : '';
          const srcFail = failParts.length ? ` ✗[${failParts.join(', ')}]` : '';
          toast.success(
            `新增 ${result.imported ?? 0} 条（抓取 ${result.total ?? 0}）${srcOk}${srcFail}`,
            { duration: 8000 },
          );
          if (result.hint) toast.info(`提示：${result.hint}`, { duration: 10000 });
          fetchLeads();
        } else {
          const hint = result.hint ? `\n提示：${result.hint}` : '';
          const srcFail = failParts.length ? `\n失败源：${failParts.join(', ')}` : '';
          toast.error(`${result.error || '导入失败'}${hint}${srcFail}`, { duration: 12000 });
        }
      }
    } catch {
      toast.error('网络错误，请稍后重试');
    } finally {
      setImporting(false);
    }
  };

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '25',
        sort: 'lead_score',
        order: 'desc',
      });
      
      if (search) params.append('search', search);
      if (status !== 'all') params.append('status', status);
      const cityQ = cityFilter.trim();
      if (cityQ) params.append('city', cityQ);
      if (region !== 'all') params.append('region', region);
      if (chineseOnly) params.append('chinese_only', '1');
      if (hideChains) params.append('hide_chains', '1');
      if (minConfidence !== 'all') params.append('min_confidence', minConfidence);
      if (licenseDateQuery.date_from) params.append('date_from', licenseDateQuery.date_from);
      if (licenseDateQuery.date_to) params.append('date_to', licenseDateQuery.date_to);

      const response = await fetch(`/api/leads?${params}`);
      const result = await response.json();

      setLeads(result.data || []);
      setTotalPages(result.pagination?.totalPages || 1);
    } catch (error) {
      console.error('Failed to fetch leads:', error);
    } finally {
      setLoading(false);
    }
  }, [page, search, status, cityFilter, region, chineseOnly, hideChains, minConfidence, licenseDateQuery]);

  useEffect(() => {
    try {
      const s = localStorage.getItem(LEADS_REGION_STORAGE_KEY);
      // 兼容老的 'bay_area' storage 值（已改名为 'sf_bay'）
      const migrated = s === 'bay_area' ? 'sf_bay' : s;
      if (migrated === 'all' || REGION_OPTIONS.some((opt) => opt.id === migrated)) {
        setRegion(migrated as LeadRegionFilterId);
      }
    } catch {
      /* ignore */
    }
    regionHydrated.current = true;
  }, []);

  useEffect(() => {
    if (!regionHydrated.current) return;
    try {
      localStorage.setItem(LEADS_REGION_STORAGE_KEY, region);
    } catch {
      /* ignore */
    }
  }, [region]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  useEffect(() => {
    setPage(1);
  }, [search, status, cityFilter, region, chineseOnly, hideChains, minConfidence, dateRange, dateFrom, dateTo]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ region });
        const res = await fetch(`/api/leads/cities?${params}`);
        const json = await res.json();
        if (!cancelled && res.ok) {
          setCitySuggestions(json.cities ?? []);
        }
      } catch {
        if (!cancelled) setCitySuggestions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [region]);

  const cityDatalistOptions = useMemo(() => {
    const q = cityFilter.trim().toLowerCase();
    const list = q
      ? citySuggestions.filter((c) => c.toLowerCase().includes(q))
      : citySuggestions;
    return list.slice(0, 80);
  }, [cityFilter, citySuggestions]);

  useEffect(() => {
    setCityFilter('');
  }, [region]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-bold text-[#1e3a5f]">Leads 列表</h2>
        <Button 
          onClick={handleImport} 
          disabled={importing}
          className="bg-[#1e3a5f] hover:bg-[#2d4a6f] shrink-0"
        >
          {importing ? (
            <>
              <span className="animate-spin mr-2">⟳</span>
              {importProgress
                ? `导入中 ${importProgress.done}/${importProgress.total}${
                    importProgress.current ? ` · ${importProgress.current}` : ''
                  }`
                : '导入中...'}
            </>
          ) : (
            <>
              <span className="mr-2">📥</span>
              {importLabel}
            </>
          )}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">筛选</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              选择地区后，列表与导入会对齐对应政府开放数据门户。目前启用的都会区：
              {REGION_OPTIONS.map((opt, i) => (
                <span key={opt.id}>
                  {i > 0 && '、'}
                  <a
                    href={opt.openDataUrl}
                    className="text-[#1e3a5f] underline underline-offset-2"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {opt.shortLabel}
                  </a>
                </span>
              ))}
              。AI 分类层仅保留 &ldquo;是餐厅&rdquo; 的条目；Google Places enrichment 会在 Phase 2 启用。
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Select
              value={region}
              onValueChange={(v) => v && setRegion(v as LeadRegionFilterId)}
            >
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="地区" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部地区</SelectItem>
                {REGION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              placeholder={t.search_placeholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64"
            />
            
            <Select value={status} onValueChange={(v) => v && setStatus(v)}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <FilterField label={t.filter_label_city} className="w-full sm:w-52">
              <Input
                placeholder={t.filter_city_placeholder}
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                list="lead-city-suggestions"
                aria-label={t.filter_label_city}
              />
              <datalist id="lead-city-suggestions">
                {cityDatalistOptions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </FilterField>

            <FilterField label={t.filter_label_date} className="w-full sm:w-[180px]">
              <Select
                value={dateRange}
                onValueChange={(v) => v && setDateRange(v as DateRangePreset)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{dateRangeLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.date_range_all}</SelectItem>
                  <SelectItem value="7d">{t.date_range_7d}</SelectItem>
                  <SelectItem value="30d">{t.date_range_30d}</SelectItem>
                  <SelectItem value="90d">{t.date_range_90d}</SelectItem>
                  <SelectItem value="custom">{t.date_range_custom}</SelectItem>
                </SelectContent>
              </Select>
            </FilterField>

            {dateRange === 'custom' && (
              <FilterField label={t.date_range_custom} className="w-full sm:w-auto">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    aria-label={t.date_from}
                    className="w-full sm:w-[150px]"
                  />
                  <span className="text-sm text-muted-foreground shrink-0">{t.date_range_to}</span>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    aria-label={t.date_to}
                    className="w-full sm:w-[150px]"
                  />
                </div>
              </FilterField>
            )}

            <FilterField label={t.filter_label_confidence} className="w-full sm:w-44">
              <Select value={minConfidence} onValueChange={(v) => v && setMinConfidence(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{confidenceLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.filter_unlimited}</SelectItem>
                  <SelectItem value="0.6">{t.confidence_06}</SelectItem>
                  <SelectItem value="0.8">{t.confidence_08}</SelectItem>
                  <SelectItem value="0.9">{t.confidence_09}</SelectItem>
                </SelectContent>
              </Select>
            </FilterField>

            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={chineseOnly}
                onChange={(e) => setChineseOnly(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              只看中餐
            </label>

            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={hideChains}
                onChange={(e) => setHideChains(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              隐藏连锁品牌
            </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]"></div>
            </div>
          ) : leads.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {t.no_leads}
            </div>
          ) : (
            <>
              {/* 手机：纵向卡片，无需横向滑动即可看全字段 */}
              <ul className="divide-y divide-border md:hidden">
                {leads.map((lead) => (
                  <li key={lead.id} className="px-4 py-4 space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="font-semibold text-foreground leading-snug break-words">
                          {lead.name}
                        </p>
                        <p className="text-sm text-muted-foreground break-words">
                          {lead.address || '—'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:shrink-0">
                        <ScoreBadge score={lead.lead_score} />
                        <StatusBadge status={lead.lead_status} />
                        <ChainBadge isChain={lead.is_chain} chainName={lead.chain_name} />
                        <SourceCountBadge sourceCount={lead.source_count} sourceIds={lead.source_ids} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span>
                        菜系：<span className="text-foreground">{lead.cuisine_type || '—'}</span>
                      </span>
                      <span aria-hidden className="text-border select-none">
                        ·
                      </span>
                      <span>
                        开发信：{' '}
                        {lead.outreach_message ? (
                          <span className="text-green-600 font-medium">已生成</span>
                        ) : (
                          <span className="text-muted-foreground">未生成</span>
                        )}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Link href={`/leads/${lead.id}`} className="block w-full">
                        <Button
                          size="sm"
                          className="w-full bg-[#1e3a5f] text-white hover:bg-[#163152]"
                        >
                          查看详情
                        </Button>
                      </Link>
                      <Link
                        href={dashboardBusinessSearchHref(lead.name, lead.city)}
                        title="在 Dashboard 打开政府/新闻/社交搜索入口"
                        className="block w-full"
                      >
                        <Button variant="outline" size="sm" className="w-full">
                          商业搜索
                        </Button>
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>

              {/* 桌面：表格 */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.col_restaurant}</TableHead>
                      <TableHead>{t.col_city}</TableHead>
                      <TableHead>{t.col_source}</TableHead>
                      <TableHead>{t.col_score}</TableHead>
                      <TableHead>{t.col_status}</TableHead>
                      <TableHead>{t.generate_message}</TableHead>
                      <TableHead className="text-right">{t.col_actions}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell className="font-medium">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span>{lead.name}</span>
                            <ChainBadge isChain={lead.is_chain} chainName={lead.chain_name} />
                            <SourceCountBadge sourceCount={lead.source_count} sourceIds={lead.source_ids} />
                          </div>
                        </TableCell>
                        <TableCell className="text-gray-500 max-w-xs truncate">
                          {lead.address || '-'}
                        </TableCell>
                        <TableCell>{lead.cuisine_type || '-'}</TableCell>
                        <TableCell>
                          <ScoreBadge score={lead.lead_score} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={lead.lead_status} />
                        </TableCell>
                        <TableCell>
                          {lead.outreach_message ? (
                            <span className="text-green-600">✓ 已生成</span>
                          ) : (
                            <span className="text-gray-400">未生成</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Link href={`/leads/${lead.id}`}>
                              <Button variant="outline" size="sm">
                                查看
                              </Button>
                            </Link>
                            <Link
                              href={dashboardBusinessSearchHref(lead.name, lead.city)}
                              title="在 Dashboard 打开政府/新闻/社交搜索入口"
                            >
                              <Button variant="secondary" size="sm" className="whitespace-nowrap">
                                商业搜索
                              </Button>
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            {t.prev_page}
          </Button>
          <span className="text-sm text-gray-500">
            {t.page_info(page, totalPages)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            {t.next_page}
          </Button>
        </div>
      )}
    </div>
  );
}
