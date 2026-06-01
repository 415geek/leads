/**
 * Houston 建筑许可 / eReport 行：Comments 常为工程描述（REMODEL、1,000 SF），
 * 不能当作餐厅 DBA 名称。
 */

const PERMIT_WORK_MARKERS =
  /\b(REMODEL|ADDITION|REPAIR|CONVERT|PER\s+SPEC|IBC|OCC\s+RPT|FOR\s+OCC|CHANGE\s+OF\s+USE|\d-\d-\d-[A-Z0-9-]+)\b/i;

const PERMIT_WORK_LEADING =
  /^(?:[\d,]+\s*SF\.?\s*)?(?:RESTAURANT|BAR|LOUNGE|CAFE|CAFÉ|KITCHEN|BAKERY|FOOD|COFFEE|TAVERN|GRILL|DINER|BREWERY|EATERY|PIZZERIA|TAPROOM|CATERING|MOBILE\s+FOOD|EATING\s+PLACE)\b/i;

/** Comments / project_name 是否为许可工程描述而非店名 */
export function isHoustonPermitWorkDescription(text: string | null | undefined): boolean {
  const t = (text ?? '').trim();
  if (t.length < 2) return false;
  if (/^[\d,]+\s*SF\.?\b/i.test(t)) return true;
  if (PERMIT_WORK_LEADING.test(t) && PERMIT_WORK_MARKERS.test(t)) return true;
  if (/^(?:RESTAURANT|BAR|LOUNGE|CAFE|KITCHEN|BAKERY|FOOD|COFFEE)\s+(?:REMODEL|ADDITION|REPAIR|CONVERT)\b/i.test(t)) {
    return true;
  }
  if (/\bREMODEL\b|\bADDITION\b|\bREPAIR\b|\bPER\s+SPEC\b|\bFOR\s+OCC\b/i.test(t) && !/\b(LLC|INC|CORP|DBA)\b/i.test(t)) {
    return true;
  }
  return false;
}

export function buildPermitLeadDisplayName(opts: {
  address: string | null | undefined;
  projectNo?: string | null;
}): string {
  const street = (opts.address ?? '').trim();
  if (street) return `New food service · ${street}`.slice(0, 120);
  const pno = (opts.projectNo ?? '').trim();
  if (pno) return `Houston permit ${pno}`.slice(0, 120);
  return 'Houston food permit';
}

/** 从 eReport Comments 推断业态标签（写入 cuisine_type，非店名） */
export function inferHoustonPermitCuisineLabel(comments: string, permitType: string): string {
  const blob = `${comments} ${permitType}`.toLowerCase();
  if (/coffee\s*shop|café|\bcafe\b/.test(blob)) return '咖啡店 · Houston 许可';
  if (/lounge|\bbar\b|tavern|\bpub\b|taproom|brewery|winery|distillery|juice\s*bar/.test(blob)) {
    return '酒吧/饮品 · Houston 许可';
  }
  if (/bakery/.test(blob)) return '烘焙 · Houston 许可';
  if (/restaurant|diner|grill|pizzeria|kitchen|eatery|bistro|dining|taco|sushi|catering|mobile\s+food|eating\s+place/.test(blob)) {
    return '餐饮 · Houston 许可';
  }
  return '餐饮许可 · Houston';
}

export function resolveHoustonPermitLeadName(opts: {
  candidateName: string | null | undefined;
  comments: string | null | undefined;
  address: string | null | undefined;
  projectNo?: string | null;
}): string {
  const candidate = (opts.candidateName ?? '').trim();
  const comments = (opts.comments ?? '').trim();

  if (candidate.length >= 2 && !isHoustonPermitWorkDescription(candidate)) {
    return candidate.slice(0, 120);
  }

  if (comments.length >= 2 && !isHoustonPermitWorkDescription(comments)) {
    const first = comments.split(/[.·]/)[0]?.trim() ?? '';
    if (first.length >= 2 && !isHoustonPermitWorkDescription(first)) {
      return first.slice(0, 120);
    }
  }

  return buildPermitLeadDisplayName({
    address: opts.address,
    projectNo: opts.projectNo,
  });
}
