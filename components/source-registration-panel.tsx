'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { LeadSourceRaw } from '@/types/lead';
import { labelForSourceKey } from '@/lib/sf-registration-labels';

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value.trim() || '—';
  if (Array.isArray(value)) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function sortedSourceKeys(raw: LeadSourceRaw): string[] {
  const keys = Object.keys(raw);
  const preferred = [
    'uniqueid',
    'certificate_number',
    'ttxid',
    'ownership_name',
    'business_name',
    'dba_name',
    'full_business_address',
    'city',
    'state',
    'business_zip',
    'business_phone',
    'dba_start_date',
    'dba_end_date',
    'location_start_date',
    'location_end_date',
    'naic_code',
    'naic_code_description',
    'naics_code_descriptions_list',
    'lic',
    'lic_code_description',
    'lic_code_descriptions_list',
    'mailing_address_1',
    'mail_city',
    'mail_state',
    'mail_zipcode',
    'location',
    'neighborhoods_analysis_boundaries',
    'supervisor_district',
    'community_benefit_district',
    'business_corridor',
    'parking_tax',
    'transient_occupancy_tax',
    'administratively_closed',
    'data_as_of',
    'data_loaded_at',
  ];
  const rest = keys.filter((k) => !preferred.includes(k)).sort((a, b) => a.localeCompare(b));
  const ordered = [...preferred.filter((k) => keys.includes(k)), ...rest];
  return ordered;
}

export function SourceRegistrationPanel({ sourceRaw }: { sourceRaw: LeadSourceRaw | null }) {
  if (!sourceRaw || Object.keys(sourceRaw).length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>政府登记原始信息</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          暂无原始登记快照。使用「自动导入」新拉取的数据会带上完整字段；历史数据可在 Supabase 执行{' '}
          <code className="rounded bg-slate-100 px-1">migration_add_source_raw.sql</code> 后重新导入。
        </CardContent>
      </Card>
    );
  }

  const keys = sortedSourceKeys(sourceRaw);

  return (
    <Card>
      <CardHeader>
        <CardTitle>政府登记原始信息（全字段）</CardTitle>
        <p className="text-sm font-normal text-muted-foreground">
          以下为数据源返回的全部字段；嵌套对象以 JSON 展示。
        </p>
      </CardHeader>
      <CardContent>
        <dl className="divide-y divide-slate-100">
          {keys.map((key) => {
            const val = sourceRaw[key];
            const text = formatValue(val);
            const multiline = text.includes('\n');
            return (
              <div
                key={key}
                className="grid gap-1 py-3 sm:grid-cols-[minmax(10rem,14rem)_1fr] sm:gap-4"
              >
                <dt className="text-xs font-medium text-slate-500 sm:pt-0.5">
                  {labelForSourceKey(key)}
                </dt>
                <dd className="text-sm text-slate-900 break-words">
                  {multiline ? (
                    <pre className="max-h-48 overflow-auto rounded-md bg-slate-50 p-2 text-xs whitespace-pre-wrap">
                      {text}
                    </pre>
                  ) : (
                    text
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </CardContent>
    </Card>
  );
}
