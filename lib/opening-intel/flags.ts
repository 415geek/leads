/** 共享开业判定层；默认关，关时各 metro 走原有逻辑。 */
export function isLeadOpeningIntelEnabled(): boolean {
  return process.env.ENABLE_LEAD_OPENING_INTEL === '1';
}
