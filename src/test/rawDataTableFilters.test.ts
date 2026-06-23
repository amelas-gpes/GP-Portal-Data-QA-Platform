import { describe, expect, it } from 'vitest';
import { compareSortValues, textMatchesQuery } from '../components/rawDataSort';

describe('compareSortValues', () => {
  const sortWith = (values: unknown[], direction: 'asc' | 'desc') =>
    [...values].sort((left, right) => compareSortValues(left, right, direction));

  it('sorts blanks last ascending', () => {
    expect(sortWith(['CC-2', null, 'CC-1', ''], 'asc')).toEqual(['CC-1', 'CC-2', null, '']);
  });

  it('sorts blanks last descending too — never above the largest values', () => {
    expect(sortWith(['CC-2', null, 'CC-1', ''], 'desc')).toEqual(['CC-2', 'CC-1', null, '']);
  });

  it('sorts numbers numerically in both directions with blanks last', () => {
    expect(sortWith([10, null, -5, 2], 'asc')).toEqual([-5, 2, 10, null]);
    expect(sortWith([10, null, -5, 2], 'desc')).toEqual([10, 2, -5, null]);
  });

  it('sorts dates chronologically with blanks last on descending', () => {
    const early = new Date(2022, 0, 1);
    const late = new Date(2025, 5, 30);
    expect(sortWith([early, null, late], 'desc')).toEqual([late, early, null]);
  });

  it('compares mixed strings with numeric awareness', () => {
    expect(sortWith(['row10', 'row2'], 'asc')).toEqual(['row2', 'row10']);
  });
});

describe('textMatchesQuery', () => {
  it('matches the formatted display text directly', () => {
    expect(textMatchesQuery('-364,406.35', '-364,406.35')).toBe(true);
  });

  it('matches plain digits against separator-formatted values', () => {
    expect(textMatchesQuery('-364,406.35', '-364406.35')).toBe(true);
    expect(textMatchesQuery('-364,406.35', '364406')).toBe(true);
  });

  it('matches separator-typed queries against plain haystacks', () => {
    expect(textMatchesQuery('-364406.35', '364,406')).toBe(true);
  });

  it('rejects values that differ beyond separators', () => {
    expect(textMatchesQuery('-364,406.35', '999406')).toBe(false);
    expect(textMatchesQuery('cc-2024', 'dist')).toBe(false);
  });
});
