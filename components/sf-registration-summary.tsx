'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { LeadSourceRaw } from '@/types/lead';
import { summarizeSfG8m3FromSourceRaw } from '@/lib/sf-data-sf-fields';

function Cell({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900 break-words">{value}</dd>
    </div>
  );
}

export function SfRegistrationSummary({ sourceRaw }: { sourceRaw: LeadSourceRaw | null | undefined }) {
  const s = summarizeSfG8m3FromSourceRaw(sourceRaw ?? null);
  if (!s) return null;

  const hasAny =
    s.ownershipName ||
    s.dbaName ||
    s.businessName ||
    s.certificateNumber ||
    s.uniqueid ||
    s.streetAddress;

  if (!hasAny) return null;

  return (
    <Card className="border-[#1e3a5f]/25 bg-slate-50/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg text-[#1e3a5f]">DataSF 登记摘要</CardTitle>
        <p className="text-sm font-normal text-muted-foreground">
          来自旧金山开放数据 Business Registration（g8m3-pdis）。与下方「系统字段」中的名称/地址一致时，以本摘要为准对照业主与 DBA。
        </p>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Cell label="法人 / 业主名称 (Ownership Name)" value={s.ownershipName} />
          <Cell label="经营字号 (DBA Name)" value={s.dbaName} />
          <Cell label="企业注册名 (Business Name)" value={s.businessName} />
          <Cell label="证书号 (Certificate #)" value={s.certificateNumber} />
          <Cell label="唯一编号 (Unique ID)" value={s.uniqueid} />
          <Cell label="税务交易 ID (TTX ID)" value={s.ttxid} />
          <Cell label="街道地址" value={s.streetAddress} />
          <Cell label="城市 / 州 / 邮编" value={s.cityStateZip} />
          <Cell label="登记电话" value={s.businessPhone} />
          <Cell label="邮寄地址" value={s.mailingLine} />
          <Cell label="NAICS / 行业" value={s.naicsLine} />
          <Cell label="执照类型" value={s.licenseLine} />
          <Cell label="DBA 开始 / 结束" value={[s.dbaStart, s.dbaEnd].filter(Boolean).join(' → ') || null} />
          <Cell label="经营场所开始 / 结束" value={[s.locationStart, s.locationEnd].filter(Boolean).join(' → ') || null} />
          <Cell label="社区 / 街区" value={s.neighborhood} />
          <Cell label="商业走廊" value={s.corridor} />
          <Cell label="市议员选区" value={s.supervisorDistrict} />
        </dl>
      </CardContent>
    </Card>
  );
}
