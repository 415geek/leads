/**
 * Chain detection pipeline step.
 *
 * Identifies franchises and chain restaurants using a blocklist of 500 top US chains
 * and token-set-ratio fuzzy matching. Detected chains receive:
 *   - is_chain = true
 *   - chain_name = matched entry
 *   - -15 score penalty in scoreV3 (applied in score.ts, not here)
 *
 * Blocklist: lib/chains/blocklist.json — updatable without code changes.
 */

import type { CrossValidatedDraft } from './cross-validate';
import { tokenSetRatio, normalizeBusinessName } from './token-set-ratio';
import blocklist from '../chains/blocklist.json';

export interface ChainDetectedDraft extends CrossValidatedDraft {
  is_chain: boolean;
  chain_name: string | null;
}

const MATCH_THRESHOLD = 85;
// Lower threshold when additional chain signals are present
const SIGNAL_THRESHOLD = 75;

// Pre-normalize blocklist entries once at module load
const normalizedBlocklist: Array<{ raw: string; normalized: string }> = blocklist.map(
  (raw) => ({ raw, normalized: normalizeBusinessName(raw) }),
);

function hasLocationNumber(name: string): boolean {
  return /#\d+/.test(name);
}

export function detectChain(draft: CrossValidatedDraft): ChainDetectedDraft {
  const name = draft.draft.name;
  const hasNumber = hasLocationNumber(name);

  let bestScore = 0;
  let bestMatch: string | null = null;

  for (const entry of normalizedBlocklist) {
    const score = tokenSetRatio(name, entry.raw);
    const threshold = hasNumber ? SIGNAL_THRESHOLD : MATCH_THRESHOLD;
    if (score >= threshold && score > bestScore) {
      bestScore = score;
      bestMatch = entry.raw;
    }
  }

  return {
    ...draft,
    is_chain: bestMatch !== null,
    chain_name: bestMatch,
  };
}

export function detectChains(
  drafts: readonly CrossValidatedDraft[],
): ChainDetectedDraft[] {
  try {
    return drafts.map(detectChain);
  } catch (err) {
    // Blocklist failure: pass through with is_chain=false for all
    console.warn('[chain-detect] blocklist error, skipping chain detection:', err);
    return drafts.map((d) => ({ ...d, is_chain: false, chain_name: null }));
  }
}

/** For scoreV3: chain penalty */
export function chainPenalty(is_chain: boolean): number {
  return is_chain ? -15 : 0;
}
