'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { LeadFiling } from '@/types/lead';
import { toast } from 'sonner';

const CA_SOS_SEARCH = 'https://bizfileonline.sos.ca.gov/search/business';

function formatFiledDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso + (iso.length <= 10 ? 'T12:00:00' : ''));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
}

export function FilingHistoryPanel({
  leadId,
  entityNumber,
  businessName,
}: {
  leadId: string;
  entityNumber?: string | null;
  /** 打开 BizFile 时复制到剪贴板，便于粘贴搜索 */
  businessName?: string | null;
}) {
  const [filings, setFilings] = useState<LeadFiling[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [manualType, setManualType] = useState('');
  const [manualControl, setManualControl] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [manualUrl, setManualUrl] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/filings`);
      if (!res.ok) throw new Error('fetch');
      const data = await res.json();
      setFilings(data.filings ?? []);
    } catch {
      toast.error('加载政府备案失败');
      setFilings([]);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    load();
  }, [load]);

  const setAllOpen = (open: boolean) => {
    containerRef.current?.querySelectorAll('details').forEach((el) => {
      (el as HTMLDetailsElement).open = open;
    });
  };

  const handleAddManual = async () => {
    const filing_type = manualType.trim();
    if (!filing_type) {
      toast.error('请填写备案类型（如 Statement of Information）');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/filings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'append',
          filings: [
            {
              filing_type,
              control_id: manualControl.trim() || null,
              filed_date: manualDate.trim() || null,
              document_url: manualUrl.trim() || null,
              source: 'manual',
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'save');
      toast.success('已添加备案');
      setManualType('');
      setManualControl('');
      setManualDate('');
      setManualUrl('');
      await load();
    } catch {
      toast.error('添加失败（若 control id 重复会拒绝）');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>政府备案（CA Secretary of State）</CardTitle>
            <p className="text-sm font-normal text-muted-foreground mt-1">
              在站内查看该企业的备案时间线与 PDF 链接。数据由你方通过 n8n 同步官方站或手动录入；本站不代爬 SOS。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setAllOpen(true)}>
              全部展开
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setAllOpen(false)}>
              全部收起
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => load()} disabled={loading}>
              刷新
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-2 text-sm">
          <a
            href={CA_SOS_SEARCH}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#1e3a5f] underline font-medium"
            title={
              businessName?.trim()
                ? '点击打开官方页，并复制该 Lead 店名到剪贴板，在站内搜索框粘贴即可'
                : undefined
            }
            onClick={() => {
              const n = businessName?.trim();
              if (n) {
                void navigator.clipboard.writeText(n).catch(() => {});
              }
            }}
          >
            打开 CA BizFile 搜索 ↗
          </a>
          {entityNumber?.trim() ? (
            <span className="text-muted-foreground">
              实体编号：<span className="font-mono text-slate-800">{entityNumber.trim()}</span>
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex justify-center py-12 text-muted-foreground">加载中…</div>
        ) : filings.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">
            暂无备案记录。请用 n8n 调用{' '}
            <code className="rounded bg-slate-100 px-1 text-xs">POST /api/leads/filings/sync</code>{' '}
            同步，或在下方手动添加一条。
          </p>
        ) : (
          <div ref={containerRef} className="space-y-2 border rounded-lg overflow-hidden">
            {filings.map((f) => (
              <details
                key={f.id}
                className="group border-b last:border-b-0 bg-white open:bg-slate-50/80"
              >
                <summary className="cursor-pointer list-none flex items-center gap-2 px-4 py-3 bg-[#1e3a5f] text-white font-medium select-none group-open:rounded-b-none">
                  <span className="opacity-80 text-xs w-5 shrink-0">▸</span>
                  <span className="flex-1">
                    {f.filing_type}
                    <span className="font-normal opacity-90"> — {formatFiledDate(f.filed_date)}</span>
                  </span>
                  {f.source === 'manual' && (
                    <span className="text-[10px] uppercase tracking-wide bg-white/20 px-2 py-0.5 rounded">
                      手动
                    </span>
                  )}
                </summary>
                <div className="px-4 py-3 space-y-2 text-sm border-t border-slate-200 bg-slate-50/50">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <div className="text-xs text-slate-500">备案类型</div>
                      <div className="font-medium">{f.filing_type}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Control ID</div>
                      <div className="font-mono">{f.control_id?.trim() ? f.control_id : '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">日期</div>
                      <div>{formatFiledDate(f.filed_date)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">文档</div>
                      {f.document_url?.trim() ? (
                        <a
                          href={f.document_url.trim()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[#1e3a5f] font-semibold underline"
                        >
                          <span>Download PDF</span>
                          <span aria-hidden>📄</span>
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-dashed p-4 space-y-3 bg-slate-50/60">
          <div className="text-sm font-medium text-slate-800">手动添加一条备案</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs text-slate-500">备案类型 *</label>
              <Input
                value={manualType}
                onChange={(e) => setManualType(e.target.value)}
                placeholder="e.g. Initial Filing"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Control ID</label>
              <Input
                value={manualControl}
                onChange={(e) => setManualControl(e.target.value)}
                placeholder="6071392"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">日期（YYYY-MM-DD）</label>
              <Input
                type="date"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-slate-500">PDF / 文档 URL</label>
              <Input
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
          <Button type="button" onClick={handleAddManual} disabled={saving} size="sm">
            {saving ? '保存中…' : '添加手动备案'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
