import { afterEach, describe, expect, it } from 'vitest';
import {
  fuzzyMatch,
  listRecentIds,
  matchFields,
  noteRecent,
  recentBoost,
  resetRecents,
  toRanges,
  tokenize,
} from '../utils/paletteSearch';

describe('fuzzyMatch', () => {
  it('matches a contiguous substring with its indices', () => {
    const result = fuzzyMatch('flow', 'Cash Flow Summary');
    expect(result).not.toBeNull();
    expect(result?.indices).toEqual([5, 6, 7, 8]);
  });

  it('returns null when a character is missing', () => {
    expect(fuzzyMatch('xyz', 'Cash Flow Summary')).toBeNull();
    expect(fuzzyMatch('cfz', 'Cash Flow Summary')).toBeNull();
  });

  it('scores word-boundary acronyms above scattered subsequences', () => {
    const acronym = fuzzyMatch('cfs', 'Cash Flow Summary');
    const scattered = fuzzyMatch('cfs', 'cliffs');
    expect(acronym).not.toBeNull();
    expect(scattered).not.toBeNull();
    expect(acronym!.score).toBeGreaterThan(scattered!.score);
    expect(acronym!.indices).toEqual([0, 5, 10]);
  });

  it('prefers a word-boundary start over an earlier mid-word match', () => {
    const result = fuzzyMatch('se', 'Base Settings');
    expect(result?.indices).toEqual([5, 6]);
  });

  it('treats an empty token as a universal match', () => {
    expect(fuzzyMatch('', 'anything')).toEqual({ score: 0, indices: [] });
  });

  it('rejects subsequences scattered across long prose', () => {
    // Every letter of "alpine" appears in order here, but nobody means this.
    const prose = 'This applies to program and uses SUM(Actual Distributions) minus carry executed';
    expect(fuzzyMatch('alpine', prose)).toBeNull();
    // The same token still matches a real prefix hit.
    expect(fuzzyMatch('alpine', 'Alpine Capital - Growth Fund I')).not.toBeNull();
  });
});

describe('matchFields', () => {
  const fields = [
    { id: 'title', text: 'Pension Fund Alpha' },
    { id: 'subtitle', text: 'Fund I · LP · USD', weight: 0.7 },
  ];

  it('lets each token land in its best field (token-AND)', () => {
    const result = matchFields(tokenize('usd alpha'), fields);
    expect(result).not.toBeNull();
    expect(result?.indicesByField.title?.length).toBeGreaterThan(0);
    expect(result?.indicesByField.subtitle?.length).toBeGreaterThan(0);
  });

  it('rejects the item when any token matches nowhere', () => {
    expect(matchFields(tokenize('usd zzz'), fields)).toBeNull();
  });

  it('matches everything on an empty query', () => {
    expect(matchFields([], fields)).toEqual({ score: 0, indicesByField: {} });
  });
});

describe('toRanges', () => {
  it('collapses sorted indices into contiguous runs', () => {
    expect(toRanges([0, 1, 2, 5, 6, 9])).toEqual([[0, 3], [5, 7], [9, 10]]);
    expect(toRanges([])).toEqual([]);
  });
});

describe('session recents', () => {
  afterEach(() => { resetRecents(); });

  it('orders by most recent use and boosts repeated use', () => {
    noteRecent('a');
    noteRecent('b');
    noteRecent('a');
    expect(listRecentIds(5)).toEqual(['a', 'b']);
    expect(recentBoost('a')).toBeGreaterThan(recentBoost('b'));
    expect(recentBoost('missing')).toBe(0);
  });
});
