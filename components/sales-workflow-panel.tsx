'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { Lead } from '@/types/lead';
import type { LeadEvidenceField } from '@/types/lead-evidence';
import type { ScoredContactChannel } from '@/lib/scoring/score-contact';

type PipelineStep = 'identify' | 'property' | 'enrich' | 'crossValidate';

interface EvidenceRow {
  id: string;
  field: LeadEvidenceField;
  value: string;
  source: string;
  fetched_at: string;
  confidence_raw: number | null;
}

interface ContactRow {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  email_inferred: boolean | null;
  source: string;
  confidence: number | null;
}

const STEP_META: Record<
  PipelineStep,
  { label: string; short: string; path: string; hint: string }
> = {
  identify: {
    label: '1. 识别经营主体',
    short: '识别',
    path: '/api/leads/identify',
    hint: 'OpenCorporates + 政府登记 → owner 证据',
  },
  property: {
    label: '2. 地产验证',
    short: '地产',
    path: '/api/property/lookup',
    hint: '读政府 source_raw，判断新店信号',
  },
  enrich: {
    label: '3. 联系方式',
    short: 'Enrich',
    path: '/api/leads/enrich',
    hint: 'Whitepages skip-trace（需有老板姓名或店名）',
  },
  crossValidate: {
    label: '4. 交叉验证',
    short: '打分',
    path: '/api/leads/cross-validate',
    hint: '汇总证据 → 联系方式评分 + 店态',
  },
};

const FIELD_LABELS: Record<LeadEvidenceField, string> = {
  owner_name: '老板姓名',
  owner_entity: '法人实体',
  phone: '电话',
  email: '邮箱',
  is_new_store: '新店信号',
  address: '地址',
};

function storeStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'new':
      return '新店';
    case 'old':
      return '老店';
    case 'renewal':
      return '续期/更新';
    case 'unknown':
      return '未知';
    default:
      return status ? String(status) : '—';
  }
}

function looksLikeEntityName(name: string): boolean {
  return /\b(LLC|INC|CORP|L\.L\.C\.|LTD|LP)\b/i.test(name);
}

function formatStepSummary(step: PipelineStep, json: Record<string, unknown>): string {
  switch (step) {
    case 'identify': {
      const status = json.ownerResolutionStatus;
      const inserted = json.evidenceInserted;
      const entity = json.entityName;
      return `实体 ${entity ?? '—'} · 状态 ${status ?? '—'} · 证据 +${inserted ?? 0}`;
    }
    case 'property': {
      const sig = json.newStoreSignal as { isNewStore?: boolean; confidence?: number } | undefined;
      const inserted = json.evidenceInserted;
      return `新店 ${sig?.isNewStore ? '是' : '否'}（${sig?.confidence ?? '—'}%）· 证据 +${inserted ?? 0}`;
    }
    case 'enrich': {
      const phones = json.phonesFound;
      const emails = json.emailsFound;
      const inserted = json.evidenceInserted;
      return `电话 ${phones ?? 0} · 邮箱 ${emails ?? 0} · 证据 +${inserted ?? 0}`;
    }
    case 'crossValidate': {
      const upserted = json.contactsUpserted;
      const store = json.storeStatus;
      const conf = json.newStoreConfidence;
      return `入库联系 ${upserted ?? 0} 条 · 店态 ${storeStatusLabel(String(store ?? ''))}（${conf ?? '—'}%）`;
    }
    default:
      return '完成';
  }
}

export function SalesWorkflowPanel({
  leadId,
  lead,
  onLeadRefresh,
  preferOwnerSearch,
}: {
  leadId: string;
  lead: Lead;
  onLeadRefresh: () => Promise<void>;
  /** 父组件在 identify review / LLC 名时高亮老板搜索 */
  preferOwnerSearch?: boolean;
}) {
  const [runningStep, setRunningStep] = useState<PipelineStep | 'all' | null>(null);
  const [lastResults, setLastResults] = useState<Partial<Record<PipelineStep, string>>>({});
  const [scoredContacts, setScoredContacts] = useState<ScoredContactChannel[]>([]);
  const [evidence, setEvidence] = useState<EvidenceRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [chainLoading, setChainLoading] = useState(true);

  const suggestOwnerSearch = useMemo(
    () => preferOwnerSearch || looksLikeEntityName(lead.name ?? ''),
    [preferOwnerSearch, lead.name],
  );

  const loadEvidenceChain = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${leadId}/evidence-chain`);
      const json = await res.json();
      if (!res.ok) return;
      setEvidence(Array.isArray(json.evidence) ? json.evidence : []);
      setContacts(Array.isArray(json.contacts) ? json.contacts : []);
    } catch {
      /* 只读展示失败不阻断 */
    } finally {
      setChainLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void loadEvidenceChain();
  }, [loadEvidenceChain]);

  const executeStep = async (
    step: PipelineStep,
    opts: { toastOnSuccess?: boolean } = {},
  ): Promise<boolean> => {
    const meta = STEP_META[step];
    const toastOnSuccess = opts.toastOnSuccess !== false;
    try {
      const res = await fetch(meta.path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId }),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        const hint = typeof json.hint === 'string' ? json.hint : '';
        const err = typeof json.error === 'string' ? json.error : '请求失败';
        toast.error(hint ? `${err}（${hint}）` : err);
        return false;
      }
      setLastResults((prev) => ({
        ...prev,
        [step]: formatStepSummary(step, json),
      }));
      if (step === 'crossValidate' && Array.isArray(json.contacts)) {
        setScoredContacts(json.contacts as ScoredContactChannel[]);
      }
      if (toastOnSuccess) {
        if (step === 'identify' && json.ownerResolutionStatus === 'review') {
          toast.message('识别需人工复核', {
            description: '建议用下方「老板信息搜索」确认自然人老板，再入库联系方式。',
          });
        } else {
          toast.success(`${meta.short} 完成`);
        }
      }
      await onLeadRefresh();
      await loadEvidenceChain();
      return true;
    } catch (err) {
      console.error(`[sales-workflow] ${step}`, err);
      toast.error('网络错误，请重试');
      return false;
    }
  };

  const runStep = async (step: PipelineStep) => {
    setRunningStep(step);
    try {
      await executeStep(step);
    } finally {
      setRunningStep(null);
    }
  };

  const runAll = async () => {
    setRunningStep('all');
    const order: PipelineStep[] = suggestOwnerSearch
      ? ['identify', 'property', 'crossValidate']
      : ['identify', 'property', 'enrich', 'crossValidate'];
    try {
      for (const step of order) {
        const ok = await executeStep(step, { toastOnSuccess: false });
        if (!ok) break;
      }
      toast.success('全流程完成');
      if (suggestOwnerSearch) {
        toast.message('建议继续老板搜索', {
          description: '此线索更像 DBA/LLC，请用下方老板搜索获取可靠联系方式。',
        });
      }
    } finally {
      setRunningStep(null);
    }
  };

  const busy = runningStep !== null;

  return (
    <Card className="border-[#1e3a5f]/20">
      <CardHeader>
        <CardTitle className="text-[#1e3a5f]">销售工作流 · 证据链</CardTitle>
        <p className="text-sm font-normal text-muted-foreground">
          一键跑政府数据识别、地产验证、联系方式与打分。DBA/LLC 或识别待复核时，优先用下方老板搜索。
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-lg bg-slate-50 p-3 text-sm">
          <div>
            <p className="text-xs text-slate-500">法人实体</p>
            <p className="font-medium break-words">{lead.owner_entity_name?.trim() || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">自然人老板</p>
            <p className="font-medium break-words">{lead.owner_person_name?.trim() || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">店态 / 新店置信</p>
            <p className="font-medium">
              {storeStatusLabel(lead.store_status ?? null)}
              {lead.new_store_confidence != null ? ` · ${lead.new_store_confidence}%` : ''}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">已入库联系</p>
            <p className="font-medium">{contacts.length} 条</p>
          </div>
        </div>

        {suggestOwnerSearch ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            建议：先跑「识别 + 地产」，再用下方 <strong>老板信息搜索</strong>（地址 + 店名关键字）入库联系方式，比直接 Enrich 更准确。
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void runAll()}
            disabled={busy}
            className="bg-[#1e3a5f] hover:bg-[#2d4a6f]"
          >
            {runningStep === 'all' ? '执行中…' : '一键跑全流程'}
          </Button>
          {(Object.keys(STEP_META) as PipelineStep[]).map((step) => (
            <Button
              key={step}
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void runStep(step)}
              title={STEP_META[step].hint}
            >
              {runningStep === step ? '…' : STEP_META[step].short}
            </Button>
          ))}
        </div>

        {Object.keys(lastResults).length > 0 ? (
          <ul className="space-y-1 text-xs text-slate-600">
            {(Object.keys(STEP_META) as PipelineStep[]).map((step) =>
              lastResults[step] ? (
                <li key={step}>
                  <span className="font-medium text-slate-800">{STEP_META[step].label}：</span>
                  {lastResults[step]}
                </li>
              ) : null,
            )}
          </ul>
        ) : null}

        {scoredContacts.length > 0 ? (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-800">最近打分结果（联系方式）</h3>
            <ul className="space-y-2">
              {scoredContacts.slice(0, 8).map((c) => (
                <li
                  key={`${c.type}-${c.value}`}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <Badge variant="outline">{c.type === 'phone' ? '电话' : '邮箱'}</Badge>
                  <span className="font-mono text-slate-900">{c.value}</span>
                  <Badge
                    className={
                      c.status === 'usable'
                        ? 'bg-emerald-600 text-white hover:bg-emerald-600'
                        : c.status === 'review'
                          ? 'bg-amber-500 text-white hover:bg-amber-500'
                          : 'bg-slate-400 text-white hover:bg-slate-400'
                    }
                  >
                    {c.status === 'usable' ? '可用' : c.status === 'review' ? '待复核' : '已丢弃'}
                  </Badge>
                  <span className="text-xs text-slate-500">置信 {c.confidence}%</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {contacts.length > 0 ? (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-800">已入库联系方式（可跟进）</h3>
            <ul className="space-y-2">
              {contacts.map((c) => (
                <li
                  key={c.id}
                  className="rounded-md border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-sm"
                >
                  <p className="font-medium text-slate-900">{c.name}</p>
                  <p className="text-slate-700">
                    {c.phone ? `📞 ${c.phone}` : null}
                    {c.phone && c.email ? ' · ' : null}
                    {c.email ? `✉️ ${c.email}` : null}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    来源 {c.source}
                    {c.confidence != null ? ` · 置信 ${Math.round(c.confidence * 100)}%` : ''}
                    {c.email_inferred ? ' · 邮箱未验证' : ''}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <details className="rounded-lg border border-slate-200">
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-slate-700">
            证据链明细（{chainLoading ? '…' : evidence.length} 条）
          </summary>
          <div className="max-h-64 overflow-auto border-t border-slate-100">
            {evidence.length === 0 ? (
              <p className="p-3 text-xs text-slate-500">暂无证据，请先运行上方步骤或老板搜索。</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium">字段</th>
                    <th className="px-2 py-1 text-left font-medium">值</th>
                    <th className="px-2 py-1 text-left font-medium">来源</th>
                  </tr>
                </thead>
                <tbody>
                  {evidence.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-2 py-1 whitespace-nowrap">
                        {FIELD_LABELS[row.field] ?? row.field}
                      </td>
                      <td className="px-2 py-1 break-all max-w-[200px]">{row.value}</td>
                      <td className="px-2 py-1 whitespace-nowrap text-slate-500">{row.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
