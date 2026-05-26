const PDL_SEARCH_URL = 'https://api.peopledatalabs.com/v5/person/search';
export const PDL_DEFAULT_PAGE_SIZE = 10;

export interface PdlSearchInput {
  name?: string;
  region?: string;
  company?: string;
}

export interface PdlPersonHit {
  id: string;
  full_name: string | null;
  job_title: string | null;
  job_company_name: string | null;
  location_name: string | null;
  linkedin_url: string | null;
  work_email: string | null;
}

export function escapePdlSqlLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "''");
}

/** 根据姓名 / 地区 / 公司构建 PDL Person Search SQL */
export function buildPdlSearchSql(input: PdlSearchInput): string | null {
  const clauses: string[] = [];
  const name = input.name?.trim();
  const region = input.region?.trim();
  const company = input.company?.trim();

  if (name) {
    const n = escapePdlSqlLiteral(name);
    clauses.push(
      `(full_name LIKE '%${n}%' OR first_name LIKE '%${n}%' OR last_name LIKE '%${n}%')`,
    );
  }
  if (company) {
    const c = escapePdlSqlLiteral(company);
    clauses.push(`job_company_name LIKE '%${c}%'`);
  }
  if (region) {
    const r = escapePdlSqlLiteral(region);
    clauses.push(
      `(location_name LIKE '%${r}%' OR location_region LIKE '%${r}%' OR location_locality LIKE '%${r}%' OR job_company_location_name LIKE '%${r}%')`,
    );
  }

  if (clauses.length === 0) return null;
  return `SELECT * FROM person WHERE ${clauses.join(' AND ')}`;
}

export function normalizePdlPerson(raw: Record<string, unknown>): PdlPersonHit {
  let workEmail: string | null =
    typeof raw.work_email === 'string' && raw.work_email ? raw.work_email : null;

  if (!workEmail && Array.isArray(raw.emails)) {
    for (const entry of raw.emails) {
      if (entry && typeof entry === 'object' && 'address' in entry) {
        const addr = (entry as { address?: string }).address;
        if (addr) {
          workEmail = addr;
          break;
        }
      }
    }
  }

  if (!workEmail && typeof raw.recommended_personal_email === 'string') {
    workEmail = raw.recommended_personal_email;
  }

  return {
    id: String(raw.id ?? ''),
    full_name: typeof raw.full_name === 'string' ? raw.full_name : null,
    job_title: typeof raw.job_title === 'string' ? raw.job_title : null,
    job_company_name:
      typeof raw.job_company_name === 'string' ? raw.job_company_name : null,
    location_name: typeof raw.location_name === 'string' ? raw.location_name : null,
    linkedin_url: typeof raw.linkedin_url === 'string' ? raw.linkedin_url : null,
    work_email: workEmail,
  };
}

export async function searchPdlPersons(
  apiKey: string,
  input: PdlSearchInput,
  size = PDL_DEFAULT_PAGE_SIZE,
): Promise<{ total: number; people: PdlPersonHit[]; scroll_token?: string }> {
  const sql = buildPdlSearchSql(input);
  if (!sql) throw new Error('EMPTY_QUERY');

  const res = await fetch(PDL_SEARCH_URL, {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ sql, size, titlecase: true }),
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    const nested =
      json.error && typeof json.error === 'object' && json.error !== null
        ? (json.error as { message?: string }).message
        : undefined;
    const err =
      nested ??
      (typeof json.error === 'string' ? json.error : undefined) ??
      (typeof json.message === 'string' ? json.message : undefined) ??
      res.statusText;
    throw new Error(`PDL_${res.status}:${err}`);
  }

  const data = Array.isArray(json.data) ? json.data : [];
  const total = typeof json.total === 'number' ? json.total : data.length;

  return {
    total,
    people: data.map((row) =>
      normalizePdlPerson(row as Record<string, unknown>),
    ),
    scroll_token: typeof json.scroll_token === 'string' ? json.scroll_token : undefined,
  };
}
