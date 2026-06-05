import Anthropic from '@anthropic-ai/sdk';
import { isLegalEntityCompanyName } from '@/lib/identity/entity-kind';
import { tavilySearchInDomains } from '@/lib/intel/deep-person-intel';
import type { OcOfficerHit } from '@/lib/opencorporates/company-search';
import { pickPrimaryOfficer } from '@/lib/opencorporates/officers';

const EXTRACT_MODEL =
  process.env.ANTHROPIC_CLASSIFY_MODEL || 'claude-haiku-4-5-20251001';

const OC_DOMAINS = ['opencorporates.com'] as const;

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

/** 从 OpenCorporates 网页摘要用正则粗抽 officer 行 */
function extractOfficersRegex(text: string): OcOfficerHit[] {
  const found: OcOfficerHit[] = [];
  const patterns = [
    /([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)+)\s*(?:—|–|-|:)\s*((?:chief|president|director|agent|secretary|manager|owner|cfo|ceo)[^.\n]{0,60})/gi,
    /((?:chief|president|director|agent|secretary|manager|owner|cfo|ceo)[^:\n]{0,40})\s*[:—-]\s*([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)+)/gi,
  ];

  for (const pattern of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const a = m[1]?.trim();
      const b = m[2]?.trim();
      if (!a || !b) continue;
      const nameFirst = /^[A-Z]/.test(a) && !/chief|president|director|agent/i.test(a);
      const name = nameFirst ? a : b;
      const position = nameFirst ? b : a;
      if (isLegalEntityCompanyName(name)) continue;
      if (/\b(director|officer|other|agent|secretary|manager|member)\b/i.test(name)) continue;
      found.push({ name, position });
    }
  }
  return dedupeOfficers(found);
}

async function extractOfficersWithAi(
  entityName: string,
  snippets: Array<{ title: string; url: string; content: string }>,
): Promise<OcOfficerHit[]> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key || snippets.length === 0) return [];

  const block = snippets
    .slice(0, 8)
    .map((s, i) => `[${i + 1}] ${s.title}\n${s.url}\n${s.content}`)
    .join('\n\n');

  const client = new Anthropic({ apiKey: key });
  const res = await client.messages.create({
    model: EXTRACT_MODEL,
    max_tokens: 600,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: `从以下 OpenCorporates / 政府登记网页摘要中，提取公司「${entityName}」的高管/董事/注册代理人姓名与职务。
只输出 JSON 数组，每项 {"name":"全名","position":"职务英文"}，最多 8 条；无则 []。
不要编造摘要中未出现的人名。

${block}`,
      },
    ],
  });

  const text =
    res.content[0]?.type === 'text' ? res.content[0].text.trim() : '';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Array<{ name?: string; position?: string }>;
    return dedupeOfficers(
      parsed
        .map((row) => ({
          name: String(row.name ?? '').trim(),
          position: String(row.position ?? 'officer').trim(),
        }))
        .filter((row) => row.name.length >= 3),
    );
  } catch {
    return [];
  }
}

export interface WebOfficerSearchResult {
  officers: OcOfficerHit[];
  primary: OcOfficerHit | null;
  snippetsUsed: number;
  via: 'regex' | 'ai' | 'none';
}

/**
 * OpenCorporates API 无 officer 时：Tavily 定向搜 opencorporates.com + 正则/AI 解析 CEO/Agent/CFO。
 */
export async function searchOpenCorporatesOfficersViaWeb(
  entityName: string,
  opts: { address?: string; region?: string } = {},
): Promise<WebOfficerSearchResult> {
  const entity = entityName.trim();
  if (entity.length < 3) {
    return { officers: [], primary: null, snippetsUsed: 0, via: 'none' };
  }

  const q = quotedIfHasSpace(entity);
  const region = opts.region?.trim() ?? '';
  const address = opts.address?.trim() ?? '';

  const queries = [
    `${q} opencorporates CEO director agent CFO officers`,
    `${q} opencorporates.com registered agent`,
    [q, address, region, 'secretary of state officers'].filter(Boolean).join(' '),
  ];

  const seen = new Set<string>();
  const snippets: Array<{ title: string; url: string; content: string }> = [];
  for (const query of queries) {
    const batch = await tavilySearchInDomains(query, OC_DOMAINS, 5).catch(() => []);
    for (const row of batch) {
      if (!row.url || seen.has(row.url)) continue;
      seen.add(row.url);
      snippets.push(row);
      if (snippets.length >= 10) break;
    }
    if (snippets.length >= 10) break;
  }

  if (snippets.length === 0) {
    return { officers: [], primary: null, snippetsUsed: 0, via: 'none' };
  }

  const blob = snippets.map((s) => `${s.title}\n${s.content}`).join('\n');
  let officers = extractOfficersRegex(blob);
  let via: WebOfficerSearchResult['via'] = officers.length > 0 ? 'regex' : 'none';

  if (officers.length === 0) {
    officers = await extractOfficersWithAi(entity, snippets);
    if (officers.length > 0) via = 'ai';
  }

  return {
    officers,
    primary: pickPrimaryOfficer(officers),
    snippetsUsed: snippets.length,
    via,
  };
}
