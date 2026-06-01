'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Lead, LeadStatus } from '@/types/lead';
import { ScoreBadge } from '@/components/score-badge';
import { StatusBadge } from '@/components/status-badge';
import { SourceRegistrationPanel } from '@/components/source-registration-panel';
import { OwnerSearchPanel } from '@/components/owner-search-panel';
import { buildOwnerSearchDefaultsFromLead } from '@/lib/lead-owner-search-defaults';
import { SfRegistrationSummary } from '@/components/sf-registration-summary';
import { FilingHistoryPanel } from '@/components/filing-history-panel';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { dashboardBusinessSearchHref } from '@/lib/dashboard-business-search';
import type { OpeningIntelWebPayload } from '@/lib/opening-intel-web';
import type { NycOpeningIntel } from '@/lib/nyc-opening-intel';

function readNycOpeningIntel(lead: Lead): NycOpeningIntel | null {
  const cls = lead.ai_classification;
  if (!cls || typeof cls !== 'object') return null;
  const raw = (cls as Record<string, unknown>).nyc_opening;
  if (!raw || typeof raw !== 'object') return null;
  const intel = raw as NycOpeningIntel;
  return intel.display_status ? intel : null;
}

function displayOrDash(value: string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const t = String(value).trim();
  return t.length ? t : '—';
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'new', label: '新线索' },
  { value: 'contacted', label: '已联系' },
  { value: 'in_progress', label: '跟进中' },
  { value: 'converted', label: '已成交' },
  { value: 'not_interested', label: '无意向' },
];

export default function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refreshingIntel, setRefreshingIntel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');
  const [entityNumber, setEntityNumber] = useState('');

  useEffect(() => {
    async function fetchLead() {
      try {
        const response = await fetch(`/api/leads/${id}`);
        if (!response.ok) {
          if (response.status === 404) {
            toast.error('Lead 不存在');
            router.push('/leads');
            return;
          }
          throw new Error('Failed to fetch');
        }
        const data = await response.json();
        setLead(data);
        setNotes(data.notes || '');
        setEntityNumber(data.ca_entity_number?.trim() ?? '');
      } catch (error) {
        console.error('Failed to fetch lead:', error);
        toast.error('获取数据失败');
      } finally {
        setLoading(false);
      }
    }

    fetchLead();
  }, [id, router]);

  const handleStatusChange = async (newStatus: LeadStatus) => {
    if (!lead) return;
    
    setSaving(true);
    try {
      const response = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_status: newStatus }),
      });
      
      if (!response.ok) throw new Error('Failed to update');
      
      const updated = await response.json();
      setLead(updated);
      toast.success('状态已更新');
    } catch (error) {
      console.error('Failed to update status:', error);
      toast.error('更新失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEntityNumber = async () => {
    if (!lead) return;
    setSaving(true);
    try {
      const v = entityNumber.trim();
      const response = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ca_entity_number: v.length ? v : null }),
      });
      if (!response.ok) throw new Error('Failed to update');
      const updated = await response.json();
      setLead(updated);
      toast.success('实体编号已保存');
    } catch (error) {
      console.error('Failed to save entity number:', error);
      toast.error('保存失败（若数据库未迁移 ca_entity_number 列会失败）');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!lead) return;
    
    setSaving(true);
    try {
      const response = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      
      if (!response.ok) throw new Error('Failed to update');
      
      const updated = await response.json();
      setLead(updated);
      toast.success('备注已保存');
    } catch (error) {
      console.error('Failed to save notes:', error);
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  function readOpeningIntelWeb(
    leadLike: Lead | null,
  ): OpeningIntelWebPayload | null {
    const raw = leadLike?.ai_classification?.opening_intel_web;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    if (typeof o.updated_at !== 'string') return null;
    if (typeof o.new_opening_confidence !== 'number') return null;
    if (typeof o.transfer_confidence !== 'number') return null;
    if (typeof o.summary_zh !== 'string') return null;
    return o as unknown as OpeningIntelWebPayload;
  }

  const handleRefreshOpeningIntel = async () => {
    if (!lead) return;
    setRefreshingIntel(true);
    try {
      const response = await fetch(`/api/leads/${id}/opening-intel`, {
        method: 'POST',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof body.error === 'string' ? body.error : '刷新失败');
      }
      if (body.lead) setLead(body.lead);
      toast.success('联网情报已更新');
    } catch (error) {
      console.error('Failed to refresh opening intel:', error);
      toast.error(error instanceof Error ? error.message : '刷新失败');
    } finally {
      setRefreshingIntel(false);
    }
  };

  const handleGenerateOutreach = async () => {
    if (!lead) return;
    
    setGenerating(true);
    try {
      const response = await fetch('/api/leads/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: id }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate');
      }
      
      const result = await response.json();
      setLead(result.lead);
      toast.success('开发信已生成');
    } catch (error) {
      console.error('Failed to generate outreach:', error);
      toast.error(error instanceof Error ? error.message : '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]"></div>
      </div>
    );
  }

  if (!lead) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="ghost"
            onClick={() => router.push('/leads')}
            className="mb-2"
          >
            ← 返回列表
          </Button>
          <h2 className="text-2xl font-bold text-[#1e3a5f]">{lead.name}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Link href={dashboardBusinessSearchHref(lead.name, lead.city)}>
            <Button variant="secondary" size="sm" className="whitespace-nowrap">
              Dashboard 商业搜索
            </Button>
          </Link>
          <ScoreBadge score={lead.lead_score} />
          <StatusBadge status={lead.lead_status} />
        </div>
      </div>

      <SfRegistrationSummary sourceRaw={lead.source_raw} />

      {(() => {
        const nyc = readNycOpeningIntel(lead);
        if (!nyc) return null;
        const highValue = nyc.lead_value === 'high';
        return (
          <Card className={highValue ? 'border-sky-200 bg-sky-50/40' : undefined}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">NYC DOHMH 检查类型</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium text-slate-900">{nyc.display_status}</p>
              <p className="text-xs text-muted-foreground">{nyc.inspection_type}</p>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-white px-2.5 py-0.5 font-medium text-sky-900 ring-1 ring-sky-200">
                  置信 {nyc.confidence_score}
                </span>
                <span className="rounded-full bg-white px-2.5 py-0.5 font-medium text-slate-700 ring-1 ring-slate-200">
                  线索价值 {nyc.lead_value === 'high' ? '高' : nyc.lead_value === 'medium' ? '中' : '低'}
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>联网情报（新开 / 转手）</CardTitle>
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={refreshingIntel}
            onClick={handleRefreshOpeningIntel}
            className="shrink-0 bg-[#1e3a5f] text-white shadow-sm hover:bg-[#163152] focus-visible:ring-[#1e3a5f]/40"
          >
            {refreshingIntel ? '分析中…' : 'AI 分析'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {(() => {
            const web = readOpeningIntelWeb(lead);
            if (!web) {
              return (
                <p className="text-sm text-muted-foreground">
                  尚未生成。点击「AI 分析」将调用 AI（消耗 API 额度）。
                </p>
              );
            }
            const isExistingRenewal = web.scenario === 'existing_permit_renewal';
            return (
              <>
                {isExistingRenewal ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-emerald-950">
                    <p className="text-sm font-semibold">
                      {web.scenario_label_zh ?? '已存在店铺，牌照更新'}
                    </p>
                    <p className="text-xs text-emerald-900/80 mt-1">
                      政府侧日期多为例行检查或许可续期，非真实新开/转手；下方概率已压低仅供参考。
                    </p>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2 items-center text-sm">
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-medium ${
                      isExistingRenewal
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    转手 {web.transfer_confidence}%
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-medium ${
                      isExistingRenewal
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-sky-100 text-sky-900'
                    }`}
                  >
                    新开 {web.new_opening_confidence}%
                  </span>
                  <span className="text-muted-foreground text-xs">
                    更新 {formatDateTime(web.updated_at)} · 摘要条数 {web.search_snippets_used}
                  </span>
                </div>
                <p className="text-sm font-medium text-slate-900">{web.summary_zh}</p>
                {web.rationale_zh ? (
                  <p className="text-xs text-slate-600 whitespace-pre-wrap">{web.rationale_zh}</p>
                ) : null}
                {web.evidence?.length ? (
                  <ul className="text-xs space-y-1 list-disc pl-4">
                    {web.evidence.map((e, i) => (
                      <li key={`${e.url}-${i}`}>
                        <a
                          href={e.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline break-all"
                        >
                          {e.title || e.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            );
          })()}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Leads 档案（系统字段全览）</CardTitle>
            <p className="text-sm font-normal text-muted-foreground">
              以下为数据库中保存的全部业务字段（与政府原始 JSON 可能部分重复，便于对照）。
            </p>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(
                [
                  ['id', '记录 ID', lead.id, false],
                  ['name', '名称（展示用）', lead.name, false],
                  ['address', '地址', displayOrDash(lead.address), false],
                  ['phone', '电话', displayOrDash(lead.phone), false],
                  ['cuisine_type', '菜系 / 业态标签', displayOrDash(lead.cuisine_type), false],
                  ['city', '城市', lead.city, false],
                  ['source', '数据来源', lead.source, false],
                  ['license_date', '执照 / 开业相关日期', displayOrDash(lead.license_date), false],
                  ['license_type', lead.source === 'nyc_dohmh' ? 'DOHMH 检查类型' : '执照类型说明', displayOrDash(lead.license_type), false],
                  [
                    'ca_entity_number',
                    'CA 实体编号（SOS）',
                    displayOrDash(lead.ca_entity_number ?? null),
                    false,
                  ],
                  ['lead_score', '线索评分', String(lead.lead_score), false],
                  ['lead_status', '跟进状态', lead.lead_status, false],
                  ['outreach_message', '开发信（已保存）', displayOrDash(lead.outreach_message), true],
                  ['notes', '备注（已保存）', displayOrDash(lead.notes), true],
                  ['created_at', '创建时间', formatDateTime(lead.created_at), false],
                  ['updated_at', '更新时间', formatDateTime(lead.updated_at), false],
                ] as const
              ).map(([key, label, value, multiline]) => (
                <div key={key} className={multiline ? 'sm:col-span-2 lg:col-span-3' : undefined}>
                  <dt className="text-xs font-medium text-slate-500">{label}</dt>
                  <dd
                    className={`mt-1 text-sm font-medium text-slate-900 break-words ${
                      multiline ? 'max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-50 p-2' : 'break-all'
                    }`}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>状态管理</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm text-gray-500 mb-2">更新状态</div>
              <Select
                value={lead.lead_status}
                onValueChange={(value) => value && handleStatusChange(value as LeadStatus)}
                disabled={saving}
              >
                <SelectTrigger className="w-full">
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
            </div>

            <div>
              <div className="text-sm text-gray-500 mb-2">CA 实体编号（BizFile）</div>
              <Input
                value={entityNumber}
                onChange={(e) => setEntityNumber(e.target.value)}
                placeholder="例如州务卿网站上的 Entity Number"
              />
              <Button
                type="button"
                onClick={handleSaveEntityNumber}
                disabled={saving}
                className="mt-2"
                size="sm"
                variant="secondary"
              >
                保存实体编号
              </Button>
            </div>

            <div>
              <div className="text-sm text-gray-500 mb-2">备注</div>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="添加备注..."
                rows={4}
              />
              <Button
                onClick={handleSaveNotes}
                disabled={saving}
                className="mt-2"
                size="sm"
              >
                {saving ? '保存中...' : '保存备注'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <OwnerSearchPanel initialValues={buildOwnerSearchDefaultsFromLead(lead)} />

      <SourceRegistrationPanel sourceRaw={lead.source_raw ?? null} />

      <FilingHistoryPanel
        leadId={id}
        businessName={lead.name}
        entityNumber={
          entityNumber.trim() !== ''
            ? entityNumber.trim()
            : lead.ca_entity_number?.trim() || undefined
        }
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>开发信</CardTitle>
          <Button
            onClick={handleGenerateOutreach}
            disabled={generating}
            className="bg-[#1e3a5f] hover:bg-[#2d4a6f]"
          >
            {generating ? '生成中...' : lead.outreach_message ? '重新生成' : '生成开发信'}
          </Button>
        </CardHeader>
        <CardContent>
          {lead.outreach_message ? (
            <div className="bg-slate-50 p-4 rounded-lg whitespace-pre-wrap">
              {lead.outreach_message}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              点击右上角按钮生成 AI 开发信
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
