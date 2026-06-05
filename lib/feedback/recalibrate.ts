import type { LeadOutcomeRow } from '@/types/lead-outcome';

export interface RecalibrateSuggestion {
  id: string;
  priority: 'high' | 'medium' | 'low';
  summary_zh: string;
  evidence: string;
}

export interface RecalibrateReport {
  generated_at: string;
  sample_size: number;
  won: number;
  lost: number;
  win_rate_pct: number;
  by_score_band: Array<{ band: string; won: number; lost: number; win_rate_pct: number }>;
  by_metro: Array<{ metro: string; won: number; lost: number; win_rate_pct: number }>;
  owner_identified_win_rate_pct: number | null;
  owner_missing_win_rate_pct: number | null;
  suggestions: RecalibrateSuggestion[];
}

function pct(won: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((won / total) * 1000) / 10;
}

function scoreBand(score: number | null): string {
  if (score == null || Number.isNaN(score)) return 'unknown';
  if (score < 50) return '0-49';
  if (score < 70) return '50-69';
  if (score < 90) return '70-89';
  return '90-100';
}

function groupCount(
  rows: readonly LeadOutcomeRow[],
  keyFn: (r: LeadOutcomeRow) => string,
): Map<string, { won: number; lost: number }> {
  const m = new Map<string, { won: number; lost: number }>();
  for (const r of rows) {
    const k = keyFn(r);
    const cur = m.get(k) ?? { won: 0, lost: 0 };
    if (r.outcome === 'won') cur.won += 1;
    else cur.lost += 1;
    m.set(k, cur);
  }
  return m;
}

export function buildRecalibrateReport(rows: readonly LeadOutcomeRow[]): RecalibrateReport {
  const won = rows.filter((r) => r.outcome === 'won').length;
  const lost = rows.filter((r) => r.outcome === 'lost').length;
  const total = won + lost;

  const byScore = [...groupCount(rows, (r) => scoreBand(r.lead_score)).entries()]
    .map(([band, c]) => ({
      band,
      won: c.won,
      lost: c.lost,
      win_rate_pct: pct(c.won, c.won + c.lost),
    }))
    .sort((a, b) => a.band.localeCompare(b.band));

  const byMetro = [...groupCount(rows, (r) => r.metro_area?.trim() || 'unknown').entries()]
    .map(([metro, c]) => ({
      metro,
      won: c.won,
      lost: c.lost,
      win_rate_pct: pct(c.won, c.won + c.lost),
    }))
    .sort((a, b) => b.won + b.lost - (a.won + a.lost));

  const withOwner = rows.filter((r) => Boolean(r.owner_person_name?.trim()));
  const withoutOwner = rows.filter((r) => !r.owner_person_name?.trim());
  const ownerWon = withOwner.filter((r) => r.outcome === 'won').length;
  const ownerLost = withOwner.filter((r) => r.outcome === 'lost').length;
  const noOwnerWon = withoutOwner.filter((r) => r.outcome === 'won').length;
  const noOwnerLost = withoutOwner.filter((r) => r.outcome === 'lost').length;

  const suggestions: RecalibrateSuggestion[] = [];

  const highBand = byScore.find((b) => b.band === '70-89' || b.band === '90-100');
  const lowBand = byScore.find((b) => b.band === '0-49');
  if (highBand && lowBand && highBand.won + highBand.lost >= 3 && lowBand.won + lowBand.lost >= 3) {
    if (highBand.win_rate_pct > lowBand.win_rate_pct + 10) {
      suggestions.push({
        id: 'score-threshold',
        priority: 'high',
        summary_zh: `高分段（${highBand.band}）成交率 ${highBand.win_rate_pct}% 明显高于低分段（${lowBand.band}）${lowBand.win_rate_pct}%，可考虑维持或提高 ENRICH_SCORE_THRESHOLD / 销售优先级门槛。`,
        evidence: `high=${highBand.won}/${highBand.won + highBand.lost}, low=${lowBand.won}/${lowBand.won + lowBand.lost}`,
      });
    }
  }

  if (byMetro.length >= 2) {
    const top = byMetro[0];
    const bottom = byMetro[byMetro.length - 1];
    if (top.won + top.lost >= 2 && bottom.won + bottom.lost >= 2 && top.win_rate_pct > bottom.win_rate_pct + 15) {
      suggestions.push({
        id: 'metro-priority',
        priority: 'medium',
        summary_zh: `${top.metro} 成交率 ${top.win_rate_pct}% 高于 ${bottom.metro} ${bottom.win_rate_pct}%，可优先投放该 metro 的线索采集与销售精力。`,
        evidence: `${top.metro}=${top.won}/${top.won + top.lost}, ${bottom.metro}=${bottom.won}/${bottom.won + bottom.lost}`,
      });
    }
  }

  if (withOwner.length >= 3 && withoutOwner.length >= 3) {
    const wrOwner = pct(ownerWon, ownerWon + ownerLost);
    const wrNo = pct(noOwnerWon, noOwnerWon + noOwnerLost);
    if (wrOwner > wrNo + 10) {
      suggestions.push({
        id: 'owner-identify',
        priority: 'high',
        summary_zh: `已识别 owner（${wrOwner}% 成交）明显优于未识别（${wrNo}%），建议保持 ENABLE_LEAD_IDENTIFY_GATE / 老板搜索投入。`,
        evidence: `with_owner=${ownerWon}/${ownerWon + ownerLost}, without=${noOwnerWon}/${noOwnerWon + noOwnerLost}`,
      });
    }
  }

  if (suggestions.length === 0 && total >= 5) {
    suggestions.push({
      id: 'insufficient-signal',
      priority: 'low',
      summary_zh: '样本量足够但各维度差异不显著，暂不建议调整权重；继续积累 outcome 后再跑本脚本。',
      evidence: `n=${total}`,
    });
  }

  if (total < 5) {
    suggestions.push({
      id: 'low-sample',
      priority: 'low',
      summary_zh: `当前仅 ${total} 条 outcome，建议至少积累 20 条 won/lost 后再依据报告调权重。`,
      evidence: `n=${total}`,
    });
  }

  return {
    generated_at: new Date().toISOString(),
    sample_size: total,
    won,
    lost,
    win_rate_pct: pct(won, total),
    by_score_band: byScore,
    by_metro: byMetro,
    owner_identified_win_rate_pct: withOwner.length ? pct(ownerWon, ownerWon + ownerLost) : null,
    owner_missing_win_rate_pct: withoutOwner.length ? pct(noOwnerWon, noOwnerWon + noOwnerLost) : null,
    suggestions,
  };
}

export function formatRecalibrateReportMarkdown(report: RecalibrateReport): string {
  const lines = [
    '# Lead Outcome 重算建议（只读报告，不自动改 config）',
    '',
    `- 生成时间：${report.generated_at}`,
    `- 样本：${report.sample_size}（won ${report.won} / lost ${report.lost}，整体成交率 ${report.win_rate_pct}%）`,
    '',
    '## 按分数段',
    ...report.by_score_band.map(
      (b) => `- ${b.band}: won ${b.won}, lost ${b.lost}, 成交率 ${b.win_rate_pct}%`,
    ),
    '',
    '## 按 Metro',
    ...report.by_metro.map(
      (m) => `- ${m.metro}: won ${m.won}, lost ${m.lost}, 成交率 ${m.win_rate_pct}%`,
    ),
    '',
    '## Owner 识别',
    `- 已识别 owner 成交率：${report.owner_identified_win_rate_pct ?? '—'}%`,
    `- 未识别 owner 成交率：${report.owner_missing_win_rate_pct ?? '—'}%`,
    '',
    '## 建议',
    ...report.suggestions.map((s) => `- [${s.priority}] ${s.summary_zh}（${s.evidence}）`),
  ];
  return lines.join('\n');
}
