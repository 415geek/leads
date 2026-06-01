/**
 * 一次性 / 运维：按 metro 重跑 pipeline 并刷新已有线索（保留 lead_status / notes）。
 *
 *   npx tsx scripts/reimport-metro.mts houston
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { sourcesForMetro } from '../lib/sources/registry';
import type { MetroArea } from '../lib/sources/types';
import { runPipeline, type PipelineLead } from '../lib/pipeline/run';
import { dedupePipelineLeads } from '../lib/pipeline/dedupe';
import { mergeHoustonCrossSourceLeads } from '../lib/pipeline/houston-merge';
import { writePipelineLeads } from '../lib/pipeline/write-leads';

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
    /* optional file */
  }
}

function loadEnvLocal() {
  loadEnvFile(resolve(process.cwd(), '.env.local'));
  loadEnvFile(resolve(process.cwd(), '.env.vercel.local'));
}

function toRefreshRow(d: PipelineLead) {
  return {
    name: d.name,
    address: d.address,
    phone: d.phone,
    cuisine_type: d.cuisine_type,
    city: d.city,
    metro_area: d.metro_area,
    license_date: d.license_date,
    first_inspection_date: d.first_inspection_date,
    license_type: d.license_type,
    source_raw: d.source_raw,
    lead_score: d.lead_score,
    is_restaurant_confidence: d.is_restaurant_confidence,
    ai_classification: d.ai_classification,
    updated_at: new Date().toISOString(),
  };
}

async function refreshExisting(
  supabase: ReturnType<typeof createClient>,
  leads: readonly PipelineLead[],
): Promise<number> {
  let updated = 0;
  const withExt = leads.filter((l) => !!l.external_id);
  for (const lead of withExt) {
    const { data, error } = await supabase
      .from('leads')
      .update(toRefreshRow(lead))
      .eq('source', lead.source)
      .eq('external_id', lead.external_id!)
      .select('id');
    if (error) {
      console.warn(`[refresh] ${lead.source}/${lead.external_id}: ${error.message}`);
      continue;
    }
    if (data?.length) updated += data.length;
  }
  return updated;
}

async function main() {
  const metro = (process.argv[2] ?? 'houston') as MetroArea;
  const onlySource = process.argv[3]?.trim();
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  let sourceIds = sourcesForMetro(metro).map((s) => s.id);
  if (onlySource) {
    if (!sourceIds.includes(onlySource)) {
      console.error(`Source ${onlySource} is not enabled for metro ${metro}`);
      process.exit(1);
    }
    sourceIds = [onlySource];
  }
  if (sourceIds.length === 0) {
    console.error(`No enabled sources for metro: ${metro}`);
    process.exit(1);
  }

  console.log(`[reimport] metro=${metro} sources=${sourceIds.join(', ')}`);
  const supabase = createClient(url, key);
  const started = Date.now();
  let totalImported = 0;
  let totalUpdated = 0;

  for (const sourceId of sourceIds) {
    console.log(`\n[reimport] --- ${sourceId} ---`);
    try {
      const { sourceResults, leads, droppedNonRestaurant } = await runPipeline({
        sourceIds: [sourceId],
        skipClassify: true,
        skipEnrich: true,
      });
      const src = sourceResults[0];
      console.log(
        `[reimport] fetched=${src?.fetched ?? 0} ok=${src?.ok} droppedNonRestaurant=${droppedNonRestaurant}`,
      );
      if (!src?.ok) {
        console.warn(`[reimport] skip ${sourceId}: ${src?.error ?? 'unknown error'}`);
        continue;
      }

      let batch = dedupePipelineLeads(leads);
      if (metro === 'houston') {
        batch = mergeHoustonCrossSourceLeads(batch);
      }

      const refreshed = await refreshExisting(supabase, batch);
      const { imported, degraded, schemaHint } = await writePipelineLeads(supabase, batch);
      totalImported += imported;
      totalUpdated += refreshed;
      console.log(`[reimport] ${sourceId}: new=${imported} updated=${refreshed}${degraded ? ' (degraded)' : ''}`);
      if (schemaHint) console.warn(schemaHint);
    } catch (err) {
      console.error(`[reimport] ${sourceId} failed:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(
    `\n[reimport] done in ${((Date.now() - started) / 1000).toFixed(1)}s — new=${totalImported} updated=${totalUpdated}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
