/**
 * Cross-validation pipeline step — resolves ARCH-4 + ARCH-1.
 *
 * Detects the same physical restaurant appearing in multiple data sources
 * within a single pipeline run. Assigns source_count and source_ids to the
 * representative draft, suppresses duplicates.
 *
 * Algorithm:
 *   1. Group ClassifiedDraft[] by blocking key (5-digit ZIP from address, fallback: city)
 *   2. Within each block, compare pairs from DIFFERENT sources using token-set-ratio
 *   3. Match threshold: >= 85 (same as fuzzywuzzy token_set_ratio recommendation)
 *   4. On match: merge source_ids into the representative draft (earliest date wins),
 *      suppress the duplicate
 *   5. Output: CrossValidatedDraft[] — each has source_count + source_ids
 *
 * Complexity: O(k²) per ZIP block where k is typically 20-50 → acceptable.
 */

import type { ClassifiedDraft } from './classify';
import { tokenSetRatio } from './token-set-ratio';

export interface CrossValidatedDraft extends ClassifiedDraft {
  source_count: number;
  source_ids: string[];
}

const MATCH_THRESHOLD = 85;

function extractZip(address: string | null): string | null {
  if (!address) return null;
  const m = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : null;
}

function blockingKey(draft: ClassifiedDraft): string {
  const zip = extractZip(draft.draft.address);
  return zip ?? draft.draft.city.toLowerCase().replace(/\s+/g, '_');
}

function earliestDate(a: ClassifiedDraft, b: ClassifiedDraft): ClassifiedDraft {
  const dateA = a.draft.first_inspection_date ?? a.draft.license_date;
  const dateB = b.draft.first_inspection_date ?? b.draft.license_date;
  if (!dateA) return b;
  if (!dateB) return a;
  return dateA <= dateB ? a : b;
}

export function crossValidateDrafts(
  classified: readonly ClassifiedDraft[],
): CrossValidatedDraft[] {
  // Group by blocking key
  const blocks = new Map<string, ClassifiedDraft[]>();
  for (const c of classified) {
    const key = blockingKey(c);
    const block = blocks.get(key);
    if (block) {
      block.push(c);
    } else {
      blocks.set(key, [c]);
    }
  }

  const suppressed = new Set<ClassifiedDraft>();
  // representative → merged source_ids accumulator
  const sourceIdsMap = new Map<ClassifiedDraft, Set<string>>();

  for (const block of blocks.values()) {
    for (let i = 0; i < block.length; i++) {
      for (let j = i + 1; j < block.length; j++) {
        const a = block[i];
        const b = block[j];

        // Only cross-validate across different sources
        if (a.draft.source === b.draft.source) continue;
        // Skip already-suppressed drafts
        if (suppressed.has(a) || suppressed.has(b)) continue;

        const score = tokenSetRatio(a.draft.name, b.draft.name);
        if (score < MATCH_THRESHOLD) continue;

        // Match found — keep the one with the earliest date as representative
        const rep = earliestDate(a, b);
        const dup = rep === a ? b : a;

        suppressed.add(dup);

        // Accumulate source_ids into rep
        if (!sourceIdsMap.has(rep)) {
          sourceIdsMap.set(rep, new Set([rep.draft.source]));
        }
        const repIds = sourceIdsMap.get(rep)!;
        repIds.add(dup.draft.source);

        // If the dup had already accumulated IDs (from a prior merge), carry them over
        const dupIds = sourceIdsMap.get(dup);
        if (dupIds) {
          for (const id of dupIds) repIds.add(id);
        }
      }
    }
  }

  return classified
    .filter((c) => !suppressed.has(c))
    .map((c) => {
      const ids = sourceIdsMap.get(c);
      const source_ids = ids ? Array.from(ids) : [c.draft.source];
      return {
        ...c,
        source_count: source_ids.length,
        source_ids,
      };
    });
}

/** Multi-source bonus for scoreV3. */
export function multiSourceBonus(source_count: number): number {
  if (source_count >= 3) return 25;
  if (source_count === 2) return 15;
  return 0;
}
