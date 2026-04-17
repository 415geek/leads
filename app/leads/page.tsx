'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
import { toast } from 'sonner';
import Link from 'next/link';
import { dashboardBusinessSearchHref } from '@/lib/dashboard-business-search';
import {
  LEADS_REGION_STORAGE_KEY,
  REGION_OPTIONS,
  cityOptionsForRegion,
  type LeadRegionFilterId,
  type LeadRegionId,
} from '@/lib/region-config';

const STATUS_OPTIONS: { value: LeadStatus | 'all'; label: string }[] = [
  { value: 'all', label: '全部状态' },
  { value: 'new', label: '新线索' },
  { value: 'contacted', label: '已联系' },
  { value: 'in_progress', label: '跟进中' },
  { value: 'converted', label: '已成交' },
  { value: 'not_interested', label: '无意向' },
];

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [city, setCity] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [region, setRegion] = useState<LeadRegionFilterId>('bay_area');
  const regionHydrated = useRef(false);

  const importRegion: LeadRegionId =
    region === 'all' ? 'bay_area' : region;

  const handleImport = async () => {
    setImporting(true);
    try {
      const response = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region: importRegion }),
      });
      const result = await response.json();
      
      if (result.success) {
        const extra =
          typeof result.chineseTagged === 'number' && result.chineseTagged > 0
            ? `，含中餐标签 ${result.chineseTagged} 条`
            : '';
        const src =
          Array.isArray(result.sources) && result.sources.length > 0
            ? ` [${result.sources
                .filter((s: { ok?: boolean }) => s.ok)
                .map((s: { id?: string }) => s.id)
                .join(', ')}]`
            : '';
        const r =
          result.region === 'houston'
            ? '休斯顿'
            : '湾区';
        toast.success(
          `【${r}】新增 ${result.imported} 条餐饮类 leads（本次合并拉取 ${result.total ?? result.imported} 条${extra}）${src}`,
        );
        fetchLeads();
      } else {
        toast.error(result.error || '导入失败，请稍后重试');
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
      if (city !== 'all') params.append('city', city);
      if (region !== 'all') params.append('region', region);
      
      const response = await fetch(`/api/leads?${params}`);
      const result = await response.json();
      
      setLeads(result.data || []);
      setTotalPages(result.pagination?.totalPages || 1);
    } catch (error) {
      console.error('Failed to fetch leads:', error);
    } finally {
      setLoading(false);
    }
  }, [page, search, status, city, region]);

  useEffect(() => {
    try {
      const s = localStorage.getItem(LEADS_REGION_STORAGE_KEY);
      if (s === 'houston' || s === 'bay_area' || s === 'all') {
        setRegion(s);
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
  }, [search, status, city, region]);

  useEffect(() => {
    setCity('all');
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
              导入中...
            </>
          ) : (
            <>
              <span className="mr-2">📥</span>
              {importRegion === 'houston'
                ? '从休斯顿开放数据导入餐饮登记'
                : '从湾区开放数据导入餐饮登记'}
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
              选择地区后，列表与导入会对齐对应政府开放数据门户（休斯顿为{' '}
              <a
                href="https://data.houstontx.gov/dataset?q=business&sort=score+desc%2C+metadata_modified+desc"
                className="text-[#1e3a5f] underline underline-offset-2"
                target="_blank"
                rel="noreferrer"
              >
                data.houstontx.gov
              </a>
              ，经 CKAN API 拉取 HDHHS 食品服务设施登记）。
            </p>
            <div className="flex flex-wrap gap-4">
            <Select
              value={region}
              onValueChange={(v) => v && setRegion(v as LeadRegionFilterId)}
            >
              <SelectTrigger className="w-[220px]">
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
              placeholder="搜索餐厅名或地址..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
            
            <Select value={status} onValueChange={(v) => v && setStatus(v)}>
              <SelectTrigger className="w-40">
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
            
            <Select value={city} onValueChange={(v) => v && setCity(v)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {cityOptionsForRegion(region).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              暂无符合条件的 leads
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>餐厅名</TableHead>
                  <TableHead>地址</TableHead>
                  <TableHead>菜系</TableHead>
                  <TableHead>评分</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>开发信</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">{lead.name}</TableCell>
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
            上一页
          </Button>
          <span className="text-sm text-gray-500">
            第 {page} 页，共 {totalPages} 页
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  );
}
