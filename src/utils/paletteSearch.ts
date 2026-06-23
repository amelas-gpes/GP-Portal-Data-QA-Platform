// Fuzzy search engine for the command palette. Token-AND subsequence matching
// with word-boundary, prefix, and contiguity bonuses; emits matched character
// indices so the UI can highlight why a result ranked. Session recents live
// here too — deliberately in-memory only: the app promises nothing outlives
// the tab, so palette history must not touch localStorage.

export type FuzzyResult = { score: number; indices: number[] };

const BOUNDARY_BONUS = 8;
const PREFIX_BONUS = 6;
const CONSECUTIVE_BONUS = 5;
const GAP_PENALTY = 0.5;
const LEAD_PENALTY = 0.4;
const LEAD_PENALTY_CAP = 4;
/** Matches scoring under MIN_SCORE_PER_CHAR × token length are noise: a
 *  subsequence scattered across a long description, not something the user
 *  meant. Boundary/contiguity bonuses put intentional matches well above. */
const MIN_SCORE_PER_CHAR = 3;
/** A token may stretch over at most 3× its length (+slack for acronyms);
 *  anything wider is prose noise, not an intentional match. */
const MAX_SPAN_SLACK = 4;
const MAX_SPAN_FACTOR = 3;

/** A char starts a word: string start, after space/punct, or a camelCase hump. */
function isBoundary(text: string, index: number): boolean {
  if (index <= 0) return true;
  const prev = text.charAt(index - 1);
  if (!/[a-z0-9]/i.test(prev)) return true;
  return /[a-z]/.test(prev) && /[A-Z]/.test(text.charAt(index));
}

function walk(tokenLower: string, text: string, textLower: string, start: number): FuzzyResult | null {
  if (start < 0) return null;
  const indices: number[] = [];
  let score = 0;
  let tokenIndex = 0;
  let previousMatch = -2;
  for (let textIndex = start; textIndex < text.length && tokenIndex < tokenLower.length; textIndex++) {
    if (textLower.charAt(textIndex) !== tokenLower.charAt(tokenIndex)) continue;
    let charScore = 1;
    if (isBoundary(text, textIndex)) charScore += BOUNDARY_BONUS;
    if (textIndex === previousMatch + 1) charScore += CONSECUTIVE_BONUS;
    score += charScore;
    indices.push(textIndex);
    previousMatch = textIndex;
    tokenIndex++;
  }
  if (tokenIndex < tokenLower.length) return null;
  const first = indices[0];
  if (first === 0) score += PREFIX_BONUS;
  score -= Math.min(LEAD_PENALTY_CAP, first * LEAD_PENALTY);
  const span = indices[indices.length - 1] - first + 1;
  if (span > tokenLower.length * MAX_SPAN_FACTOR + MAX_SPAN_SLACK) return null;
  score -= (span - indices.length) * GAP_PENALTY;
  if (score < tokenLower.length * MIN_SCORE_PER_CHAR) return null;
  return { score, indices };
}

/**
 * Match one query token against text. Greedy walk from the first occurrence,
 * plus a second walk anchored at the first word-boundary occurrence — the
 * better of the two wins ("se" should prefer the start of "Settings" over the
 * tail of "base"). Boundary bonuses make acronyms ("cfs" → Cash Flow Summary)
 * outrank scattered matches.
 */
export function fuzzyMatch(token: string, text: string): FuzzyResult | null {
  if (!token) return { score: 0, indices: [] };
  if (!text) return null;
  const tokenLower = token.toLowerCase();
  const textLower = text.toLowerCase();
  const greedy = walk(tokenLower, text, textLower, textLower.indexOf(tokenLower.charAt(0)));
  let boundaryStart = -1;
  for (let index = 0; index < text.length; index++) {
    if (textLower.charAt(index) === tokenLower.charAt(0) && isBoundary(text, index)) {
      boundaryStart = index;
      break;
    }
  }
  const anchored = boundaryStart >= 0 ? walk(tokenLower, text, textLower, boundaryStart) : null;
  if (!greedy) return anchored;
  if (!anchored) return greedy;
  return anchored.score >= greedy.score ? anchored : greedy;
}

export function tokenize(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export type SearchableField = { id: string; text: string; weight?: number };
export type FieldMatch = { score: number; indicesByField: Record<string, number[]> };

/**
 * Every token must land in some field (each token keeps its best field, so
 * "usd pension" can match currency in the subtitle and name in the title);
 * scores add across tokens.
 */
export function matchFields(tokens: string[], fields: SearchableField[]): FieldMatch | null {
  if (!tokens.length) return { score: 0, indicesByField: {} };
  const indicesByField: Record<string, number[]> = {};
  let total = 0;
  for (const token of tokens) {
    let bestFieldId: string | null = null;
    let bestScore = -Infinity;
    let bestIndices: number[] = [];
    for (const field of fields) {
      if (!field.text) continue;
      const result = fuzzyMatch(token, field.text);
      if (!result) continue;
      const weighted = result.score * (field.weight ?? 1);
      if (weighted > bestScore) {
        bestScore = weighted;
        bestFieldId = field.id;
        bestIndices = result.indices;
      }
    }
    if (bestFieldId === null) return null;
    total += bestScore;
    const bucket = indicesByField[bestFieldId] ?? (indicesByField[bestFieldId] = []);
    bucket.push(...bestIndices);
  }
  for (const fieldId of Object.keys(indicesByField)) {
    indicesByField[fieldId] = Array.from(new Set(indicesByField[fieldId])).sort((a, b) => a - b);
  }
  return { score: total, indicesByField };
}

/** Collapse sorted indices into [start, endExclusive) runs for rendering. */
export function toRanges(indices: number[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const index of indices) {
    const last = ranges[ranges.length - 1];
    if (last && index === last[1]) last[1] = index + 1;
    else ranges.push([index, index + 1]);
  }
  return ranges;
}

// ── Session recents ─────────────────────────────────────────────────────────

type RecentRecord = { count: number; tick: number };

const recents = new Map<string, RecentRecord>();
let recentTick = 0;

export function noteRecent(id: string): void {
  recentTick += 1;
  const current = recents.get(id);
  recents.set(id, { count: (current?.count ?? 0) + 1, tick: recentTick });
}

/** Ranking boost for items used this session: 5 on first use, up to 8. */
export function recentBoost(id: string): number {
  const entry = recents.get(id);
  return entry ? 4 + Math.min(4, entry.count) : 0;
}

export function listRecentIds(limit: number): string[] {
  return Array.from(recents.entries())
    .sort((a, b) => b[1].tick - a[1].tick)
    .slice(0, limit)
    .map(([id]) => id);
}

export function resetRecents(): void {
  recents.clear();
  recentTick = 0;
}
