/**
 * 离线读取 lead_outcomes，产出权重建议报告（不自动改 config）。
 *
 *   npx tsx scripts/recalibrate.mts
 *   npx tsx scripts/recalibrate.mts --json
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  buildRecalibrateReport,
  formatRecalibrateReportMarkdown,
} from '../lib/feedback/recalibrate';
import type { LeadOutcomeRow } from '../types/lead-outcome';

function loadEnvFile(path: string) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}

function loadEnvLocal() {
  loadEnvFile(resolve(process.cwd(), '.env.local'));
  loadEnvFile(resolve(process.cwd(), '.env.vercel.local'));
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const jsonOut = process.argv.includes('--json');
  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from('lead_outcomes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    if (error.code === '42P01') {
      console.error('lead_outcomes 表不存在，请先在 Supabase 执行 supabase/migrations/20260604000000_lead_outcomes.sql');
      process.exit(1);
    }
    throw error;
  }

  const report = buildRecalibrateReport((data ?? []) as LeadOutcomeRow[]);
  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatRecalibrateReportMarkdown(report));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
