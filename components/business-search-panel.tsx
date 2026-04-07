'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DASHBOARD_BIZ_CITY_QUERY,
  DASHBOARD_BIZ_QUERY,
} from '@/lib/dashboard-business-search';
import {
  buildBusinessSearchLinks,
  groupLinksByCategory,
  type BusinessSearchCategory,
} from '@/lib/business-search-sources';

function BusinessSearchPanelInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const appliedFromUrl = useRef(false);

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [enrich, setEnrich] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (appliedFromUrl.current) return;
    const biz = searchParams.get(DASHBOARD_BIZ_QUERY)?.trim();
    const bizCity = searchParams.get(DASHBOARD_BIZ_CITY_QUERY)?.trim();
    if (biz && biz.length >= 2) {
      appliedFromUrl.current = true;
      setName(biz);
      setCity(bizCity ?? '');
      setSubmitted(true);
      router.replace(pathname || '/', { scroll: false });
    }
  }, [searchParams, router, pathname]);

  const { categories, links } = useMemo(() => {
    if (!submitted || name.trim().length < 2) {
      return { categories: [] as BusinessSearchCategory[], links: [] };
    }
    return buildBusinessSearchLinks(name, { city: city || undefined, enrichWithRestaurant: enrich });
  }, [name, city, enrich, submitted]);

  const grouped = useMemo(() => groupLinksByCategory(links), [links]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return;
    setSubmitted(true);
  };

  return (
    <Card className="border-[#1e3a5f]/20">
      <CardHeader>
        <CardTitle className="text-lg text-[#1e3a5f]">商业搜索</CardTitle>
        <p className="text-sm font-normal text-muted-foreground">
          输入企业 / 餐厅名称，一键打开加州 SOS、湾区主要开放数据门户，以及新闻与社交平台的检索链接。
          政府数据多为分库分表，需在目标网站内继续筛选；本站不抓取第三方页面内容。
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-slate-600">企业 / 品牌名称 *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：Dragon Palace Restaurant"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">城市（可选，提高命中率）</label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="San Francisco / Oakland …"
                className="mt-1"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enrich}
                  onChange={(e) => setEnrich(e.target.checked)}
                  className="rounded border-slate-300"
                />
                新闻/网页搜索附带「restaurant California」
              </label>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="bg-[#1e3a5f] hover:bg-[#2d4a6f]">
              生成搜索入口
            </Button>
            {submitted && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSubmitted(false);
                }}
              >
                清除结果
              </Button>
            )}
          </div>
        </form>

        {submitted && name.trim().length < 2 && (
          <p className="text-sm text-amber-700">名称至少 2 个字符。</p>
        )}

        {submitted && name.trim().length >= 2 && categories.length > 0 && (
          <div className="space-y-8">
            {categories.map((cat) => {
              const items = grouped.get(cat.id) ?? [];
              if (items.length === 0) return null;
              return (
                <section key={cat.id} className="space-y-3">
                  <div>
                    <h3 className="font-semibold text-slate-900">{cat.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>
                  </div>
                  <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((item) => (
                      <li key={item.id}>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-[#1e3a5f]/40 hover:bg-slate-50/80"
                        >
                          <span className="text-sm font-medium text-[#1e3a5f]">{item.label}</span>
                          <span className="mt-1 text-xs text-muted-foreground leading-snug">
                            {item.description}
                          </span>
                          <span className="mt-2 text-xs font-medium text-amber-700/90">在新标签打开 ↗</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function BusinessSearchPanel() {
  return (
    <Suspense
      fallback={
        <Card className="border-[#1e3a5f]/20">
          <CardHeader>
            <CardTitle className="text-lg text-[#1e3a5f]">商业搜索</CardTitle>
            <p className="text-sm text-muted-foreground">加载中…</p>
          </CardHeader>
        </Card>
      }
    >
      <BusinessSearchPanelInner />
    </Suspense>
  );
}
