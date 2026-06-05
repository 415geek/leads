/** 从 ai_classification 提取开业/情报快照，供 outcome 与离线重算使用。 */
export function extractOpeningSnapshot(
  ai: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!ai || typeof ai !== 'object') return null;
  const keys = [
    'nyc_opening',
    'houston_opening',
    'datasf_opening',
    'opening_intel_score',
    'opening_intel_web',
  ] as const;
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (ai[k] != null) out[k] = ai[k];
  }
  return Object.keys(out).length > 0 ? out : null;
}
