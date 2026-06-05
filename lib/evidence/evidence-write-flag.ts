/** Owner 搜索 / enrich 结果写入 lead_evidence → cross-validate；默认关。 */
export function isLeadEvidenceWriteEnabled(): boolean {
  return process.env.ENABLE_LEAD_EVIDENCE_WRITE === '1';
}
