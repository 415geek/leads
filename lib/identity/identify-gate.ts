/** identify 多源投票闸门；默认关，关时沿用 consensus.locked 写 owner_person_name。 */
export function isLeadIdentifyGateEnabled(): boolean {
  return process.env.ENABLE_LEAD_IDENTIFY_GATE === '1';
}
