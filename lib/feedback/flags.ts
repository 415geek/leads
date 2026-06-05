/** win/lost 反馈落库；默认关，关时 PATCH 行为与改动前一致。 */
export function isLeadFeedbackEnabled(): boolean {
  return process.env.ENABLE_LEAD_FEEDBACK === '1';
}
