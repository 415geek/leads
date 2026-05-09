/**
 * Token-set-ratio similarity algorithm (fuzzywuzzy/rapidfuzz compatible).
 *
 * Resolves ARCH-4: Fuse.js uses a different algorithm (bitap fuzzy) and is not
 * suitable for business name matching. Token-set-ratio handles token reordering
 * and legal suffix differences that Fuse.js misses.
 *
 * Algorithm:
 *   1. Tokenize both strings (lowercase, alphanumeric only)
 *   2. Compute intersection and remainders of token sets
 *   3. Build three candidate strings: t0 (intersection), t1 (t0 + a_only), t2 (t0 + b_only)
 *   4. Return max(ratio(t0,t1), ratio(t0,t2), ratio(t1,t2)) * 100
 *
 * Returns 0..100. Use threshold >= 85 for business name deduplication.
 *
 * Known limitation: "Subway" vs "Subway Tiles" will score 100 because
 * t0=intersection=["subway"], t1=["subway"], and ratio(t0,t1)=100.
 * Token-set-ratio is designed this way — "if A is a subset of B's tokens, they match."
 * Chain detection (separate step) applies the -15 penalty; cross-validation only
 * cares whether it's the SAME entity, not whether it should be prioritized.
 */

// Legal / corporate suffixes only — no food words (avoid stripping brand tokens like "Grill" in "Chipotle Mexican Grill")
const LEGAL_SUFFIXES =
  /\b(llc|inc|corp|co|ltd|lp|llp|pllc|plc|company|corporation|incorporated|limited)\b\.?/gi;

// Franchise location numbers: #4521, #104, etc.
const FRANCHISE_NUMBERS = /#\d+/g;

/** Strip legal suffixes + franchise numbers, collapse whitespace, lowercase. */
export function normalizeBusinessName(raw: string): string {
  return raw
    // Contract possessive/curly apostrophes before stripping non-alphanumeric
    // so "McDonald's" → "McDonalds" (not "McDonald s")
    .replace(/['‘’ʼ]/g, '')
    .replace(FRANCHISE_NUMBERS, '')
    .replace(LEGAL_SUFFIXES, ' ')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = Array.from({ length: n + 1 }, (_, j) => j);
  const curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev.splice(0, prev.length, ...curr);
  }
  return prev[n];
}

function ratio(a: string, b: string): number {
  if (!a && !b) return 100;
  // One side empty after normalization = definitely not a match
  if (!a || !b) return 0;
  const total = a.length + b.length;
  const lev = levenshtein(a, b);
  return Math.round((1 - (2 * lev) / total) * 100);
}

/**
 * Token-set-ratio between two business names.
 * Normalizes legal suffixes and franchise numbers before comparison.
 * Returns 0..100.
 */
export function tokenSetRatio(nameA: string, nameB: string): number {
  const a = normalizeBusinessName(nameA);
  const b = normalizeBusinessName(nameB);

  // After normalization, empty = no match
  if (!a || !b) return 0;

  const tokA = new Set(tokenize(a));
  const tokB = new Set(tokenize(b));

  const intersection = [...tokA].filter((t) => tokB.has(t)).sort();
  const remainderA = [...tokA].filter((t) => !tokB.has(t)).sort();
  const remainderB = [...tokB].filter((t) => !tokA.has(t)).sort();

  const t0 = intersection.join(' ');
  const t1 = [t0, ...remainderA].join(' ').trim();
  const t2 = [t0, ...remainderB].join(' ').trim();

  return Math.max(ratio(t0, t1), ratio(t0, t2), ratio(t1, t2));
}
