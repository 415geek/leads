import Anthropic from '@anthropic-ai/sdk';
import { tavilySearchInDomains } from '@/lib/intel/deep-person-intel';
import type { OcOfficerHit } from '@/lib/opencorporates/company-search';
import { pickPrimaryOfficer } from '@/lib/opencorporates/officers';

const EXTRACT_MODEL =
  process.env.ANTHROPIC_CLASSIFY_MODEL || 'claude-haiku-4-5-20251001';

const PRIMARY_REGISTRY_DOMAINS = ['opencorporates.com'] as const;

const FALLBACK_REGISTRY_DOMAINS = [
  'opencorporates.com',
  'bizfileonline.sos.ca.gov',
  'sos.ca.gov',
] as const;

const REGISTRY_URL_PATTERN =
  /opencorporates\.com\/companies\/|bizfileonline\.sos\.ca\.gov|sos\.ca\.gov/i;

export interface WebRegistryProfile {
  entityName: string;
  companyNumber: string | null;
  status: string | null;
  incorporationDate: string | null;
  companyType: string | null;
  jurisdiction: string | null;
  registeredAddress: string | null;
  agentName: string | null;
  agentAddress: string | null;
  directorsOfficers: string | null;
  officers: OcOfficerHit[];
  registryUrl: string | null;
  snippetsUsed: number;
  via: 'ai' | 'regex' | 'none';
}

function quotedIfHasSpace(v: string): string {
  return /\s/.test(v) ? `"${v}"` : v;
}

function dedupeOfficers(rows: OcOfficerHit[]): OcOfficerHit[] {
  const seen = new Set<string>();
  const out: OcOfficerHit[] = [];
  for (const row of rows) {
    const key = `${row.name.toLowerCase()}|${row.position.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function normalizeJurisdiction(raw: string | null | undefined): string | null {
  const j = raw?.trim();
  if (!j) return null;
  if (/california/i.test(j) || j === 'us_ca' || j === 'CA') return 'California (US)';
  return j;
}

function extractProfileRegex(
  entityName: string,
  snippets: Array<{ title: string; url: string; content: string }>,
): Partial<WebRegistryProfile> | null {
  const blob = snippets.map((s) => `${s.title}\n${s.content}`).join('\n');
  if (!blob.trim()) return null;

  const companyNumber =
    blob.match(/\b([BC]\d{11,14})\b/i)?.[1]?.toUpperCase() ??
    blob.match(/company\s*(?:number|#)\s*[:.]?\s*([A-Z0-9-]+)/i)?.[1]?.trim() ??
    null;

  const status =
    blob.match(/status\s*[:.]?\s*(active|inactive|dissolved|suspended)/i)?.[1] ?? null;

  const incorporationDate =
    blob.match(
      /(?:incorporation|registration|filing)\s*date\s*[:.]?\s*(\d{1,2}\s+\w+\s+\d{4})/i,
    )?.[1] ?? null;

  const companyType =
    blob.match(
      /company\s*type\s*[:.]?\s*([^\n]{5,80}?(?:LLC|Corporation|Company)[^\n]{0,40})/i,
    )?.[1]?.trim() ?? null;

  const agentMatch = blob.match(
    /(?:registered\s+)?agent\s*[:.]?\s*([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)+)/i,
  );

  const officers: OcOfficerHit[] = [];
  if (agentMatch?.[1]) {
    officers.push({ name: agentMatch[1].trim(), position: 'agent' });
  }

  const primary = pickPrimaryOfficer(officers);
  const registryUrl =
    snippets.find((s) => /opencorporates\.com\/companies\//i.test(s.url))?.url ?? null;

  if (!companyNumber && !status && !agentMatch && !incorporationDate) return null;

  return {
    entityName,
    companyNumber,
    status: status ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase() : null,
    incorporationDate,
    companyType,
    jurisdiction: 'California (US)',
    registeredAddress: null,
    agentName: agentMatch?.[1]?.trim() ?? null,
    agentAddress: null,
    directorsOfficers: primary ? `${primary.name}, ${primary.position}` : null,
    officers,
    registryUrl,
    snippetsUsed: snippets.length,
    via: 'regex',
  };
}

async function extractProfileWithAi(
  entityName: string,
  snippets: Array<{ title: string; url: string; content: string }>,
): Promise<Partial<WebRegistryProfile> | null> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key || snippets.length === 0) return null;

  const block = snippets
    .slice(0, 10)
    .map((s, i) => `[${i + 1}] ${s.title}\n${s.url}\n${s.content}`)
    .join('\n\n');

  const client = new Anthropic({ apiKey: key });
  const res = await client.messages.create({
    model: EXTRACT_MODEL,
    max_tokens: 900,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: `从以下 OpenCorporates 网页摘要中提取公司「${entityName}」的政府登记信息。
只输出一个 JSON 对象（不要 markdown），字段如下；摘要中未出现的字段用 null：
{
  "entity_name": "公司法定名",
  "company_number": "如 B20260193867",
  "status": "如 Active",
  "incorporation_date": "如 23 April 2026",
  "company_type": "如 Limited Liability Company - CA",
  "jurisdiction": "如 California (US)",
  "registered_address": "多行地址用 \\n 分隔",
  "agent_name": "登记代理人姓名",
  "agent_address": "代理人地址单行",
  "directors_officers": [{"name":"全名","position":"如 agent"}]
}
不要编造摘要中未出现的信息。

${block}`,
      },
    ],
  });

  const text = res.content[0]?.type === 'text' ? res.content[0].text.trim() : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      entity_name?: string;
      company_number?: string | null;
      status?: string | null;
      incorporation_date?: string | null;
      company_type?: string | null;
      jurisdiction?: string | null;
      registered_address?: string | null;
      agent_name?: string | null;
      agent_address?: string | null;
      directors_officers?: Array<{ name?: string; position?: string }>;
    };

    const officers = dedupeOfficers(
      (parsed.directors_officers ?? [])
        .map((row) => ({
          name: String(row.name ?? '').trim(),
          position: String(row.position ?? 'officer').trim().toLowerCase(),
        }))
        .filter((row) => row.name.length >= 3),
    );

    if (!parsed.agent_name && officers.length === 0 && !parsed.company_number) {
      return null;
    }

    const primary = pickPrimaryOfficer(officers);
    const agentName = parsed.agent_name?.trim() || primary?.name || null;
    const agentRole = primary?.position ?? 'agent';

    return {
      entityName: parsed.entity_name?.trim() || entityName,
      companyNumber: parsed.company_number?.trim() || null,
      status: parsed.status?.trim() || null,
      incorporationDate: parsed.incorporation_date?.trim() || null,
      companyType: parsed.company_type?.trim() || null,
      jurisdiction: normalizeJurisdiction(parsed.jurisdiction),
      registeredAddress: parsed.registered_address?.trim() || null,
      agentName,
      agentAddress: parsed.agent_address?.trim() || null,
      directorsOfficers: primary
        ? `${primary.name}, ${agentRole}`
        : agentName
          ? `${agentName}, agent`
          : null,
      officers,
      registryUrl:
        snippets.find((s) => /opencorporates\.com\/companies\//i.test(s.url))?.url ?? null,
      snippetsUsed: snippets.length,
      via: 'ai',
    };
  } catch {
    return null;
  }
}

export function tavilyRegistrySearchConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY?.trim());
}

/**
 * 无 OpenCorporates API token / CA SOS key 时：Tavily 定向搜 opencorporates.com，
 * AI/正则抽取完整登记档案（图2 字段）。
 */
export async function searchRegistryProfileViaWeb(
  entityName: string,
  opts: {
    address?: string;
    region?: string;
    entityNumber?: string;
  } = {},
): Promise<WebRegistryProfile | null> {
  if (!tavilyRegistrySearchConfigured()) return null;

  const entity = entityName.trim();
  if (entity.length < 3) return null;

  const q = quotedIfHasSpace(entity);
  const region = opts.region?.trim() ?? '';
  const address = opts.address?.trim() ?? '';
  const entityNo = opts.entityNumber?.trim() ?? '';

  const queries = [
    entityNo ? `${entityNo} opencorporates.com` : '',
    `${q} opencorporates.com california company registration`,
    `${q} opencorporates registered agent incorporation date`,
    entityNo ? `${entityNo} bizfile california secretary of state` : '',
    [q, address, region, 'opencorporates company number status'].filter(Boolean).join(' '),
    [q, address, region, 'california secretary of state LLC agent'].filter(Boolean).join(' '),
  ].filter(Boolean);

  const seen = new Set<string>();
  const snippets: Array<{ title: string; url: string; content: string }> = [];

  const collect = (
    batch: Array<{ title: string; url: string; content: string }>,
    requireRegistryUrl = false,
  ) => {
    for (const row of batch) {
      if (!row.url || seen.has(row.url)) continue;
      if (requireRegistryUrl && !REGISTRY_URL_PATTERN.test(row.url)) continue;
      seen.add(row.url);
      snippets.push(row);
      if (snippets.length >= 12) return true;
    }
    return snippets.length >= 12;
  };

  for (const query of queries) {
    const batch = await tavilySearchInDomains(query, PRIMARY_REGISTRY_DOMAINS, 5).catch(
      () => [],
    );
    if (collect(batch)) break;
  }

  if (snippets.length === 0) {
    for (const query of queries.slice(0, 4)) {
      const batch = await tavilySearchInDomains(query, FALLBACK_REGISTRY_DOMAINS, 5).catch(
        () => [],
      );
      if (collect(batch)) break;
    }
  }

  if (snippets.length === 0 && process.env.TAVILY_API_KEY?.trim()) {
    const key = process.env.TAVILY_API_KEY.trim();
    for (const query of queries.slice(0, 3)) {
      try {
        const res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: key,
            query,
            search_depth: 'advanced',
            max_results: 8,
            include_answer: false,
          }),
          signal: AbortSignal.timeout(12_000),
        });
        if (!res.ok) continue;
        const data = (await res.json()) as {
          results?: Array<{ title?: string; url?: string; content?: string }>;
        };
        const batch = (data.results ?? []).map((r) => ({
          title: String(r.title ?? ''),
          url: String(r.url ?? ''),
          content: String(r.content ?? '').slice(0, 900),
        }));
        if (collect(batch, true)) break;
      } catch {
        /* 广域搜索失败不阻断 */
      }
    }
  }

  if (snippets.length === 0) return null;

  let partial = await extractProfileWithAi(entity, snippets);
  let via: WebRegistryProfile['via'] = partial ? 'ai' : 'none';

  if (!partial) {
    partial = extractProfileRegex(entity, snippets);
    via = partial ? 'regex' : 'none';
  }

  if (!partial) return null;

  const officers =
    partial.officers && partial.officers.length > 0
      ? partial.officers
      : partial.agentName
        ? [{ name: partial.agentName, position: 'agent' }]
        : [];

  return {
    entityName: partial.entityName ?? entity,
    companyNumber: partial.companyNumber ?? (entityNo || null),
    status: partial.status ?? null,
    incorporationDate: partial.incorporationDate ?? null,
    companyType: partial.companyType ?? null,
    jurisdiction: partial.jurisdiction ?? normalizeJurisdiction(region) ?? 'California (US)',
    registeredAddress: partial.registeredAddress ?? null,
    agentName: partial.agentName ?? null,
    agentAddress: partial.agentAddress ?? null,
    directorsOfficers: partial.directorsOfficers ?? null,
    officers,
    registryUrl: partial.registryUrl ?? snippets[0]?.url ?? null,
    snippetsUsed: snippets.length,
    via,
  };
}
