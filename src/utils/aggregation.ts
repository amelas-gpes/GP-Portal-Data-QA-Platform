import { fieldToKey, type NumericKey } from '../data/columns';
import type { BIRow, DashboardFilters } from '../types';

export type Bucket<T extends string | number> = {
  key: T;
  label: string;
  rows: BIRow[];
  endDate: Date | null;
};

// Half a cent. Sums over hundreds of thousands of currency rows that logically
// cancel leave floating-point residue (up to ~1e-4 at fund scale); an exact
// `=== 0` zero check lets a residue denominator blow a ratio up to ~1e15.
// Every divide in the formula registry uses currency sums as denominators, so
// anything below half a cent is treated as zero.
export const MONEY_EPSILON = 0.005;

export function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || Math.abs(denominator) < MONEY_EPSILON) return fallback;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : fallback;
}

export function applyThreshold(value: number, threshold = 50): number {
  return Math.abs(value) < threshold ? 0 : value;
}

export function sumField(rows: BIRow[], field: string): number {
  const key = fieldToKey(field);
  if (!key) return 0;
  return rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
}

export function absSumField(rows: BIRow[], field: string): number {
  return Math.abs(sumField(rows, field));
}

export function negSumField(rows: BIRow[], field: string): number {
  return -sumField(rows, field);
}

export function sortByPostingDate(rows: BIRow[]): BIRow[] {
  return [...rows].sort((a, b) => {
    const aTime = a.postingDate?.getTime() ?? 0;
    const bTime = b.postingDate?.getTime() ?? 0;
    return aTime - bTime || a.rowId - b.rowId;
  });
}

export function groupByQuarter(rows: BIRow[]): Bucket<string>[] {
  const map = new Map<string, BIRow[]>();
  for (const row of rows) {
    const key = row.postingQuarterLabel ?? 'No Date';
    const bucket = map.get(key) ?? [];
    bucket.push(row);
    map.set(key, bucket);
  }
  return Array.from(map.entries())
    .map(([key, bucketRows]) => ({
      key,
      label: key,
      rows: bucketRows,
      endDate: maxDate(bucketRows),
    }))
    .sort(compareBuckets);
}

export function groupByYear(rows: BIRow[]): Bucket<number>[] {
  const map = new Map<number, BIRow[]>();
  for (const row of rows) {
    const year = row.postingYear ?? 0;
    const bucket = map.get(year) ?? [];
    bucket.push(row);
    map.set(year, bucket);
  }
  return Array.from(map.entries())
    .map(([key, bucketRows]) => ({
      key,
      label: key === 0 ? 'No Date' : String(key),
      rows: bucketRows,
      endDate: maxDate(bucketRows),
    }))
    .sort((a, b) => a.key - b.key);
}

export function groupByProgram(rows: BIRow[]): Bucket<string>[] {
  const map = new Map<string, BIRow[]>();
  for (const row of rows) {
    const key = row.programKey || 'Unassigned program';
    const bucket = map.get(key) ?? [];
    bucket.push(row);
    map.set(key, bucket);
  }
  return Array.from(map.entries())
    .map(([key, bucketRows]) => ({
      key,
      label: key,
      rows: bucketRows,
      endDate: maxDate(bucketRows),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function cumulativeRowsThrough(rows: BIRow[], endDate: Date | null): BIRow[] {
  if (!endDate) return rows;
  const endTime = endDate.getTime();
  return rows.filter((row) => row.postingDate && row.postingDate.getTime() <= endTime);
}

export function cumulativeSeries<T extends Record<string, unknown>>(series: T[], fields: Array<keyof T>): T[] {
  const running = new Map<keyof T, number>();
  return series.map((point) => {
    const next = { ...point };
    for (const field of fields) {
      const prior = running.get(field) ?? 0;
      const value = Number(point[field] ?? 0);
      const total = prior + value;
      running.set(field, total);
      next[field] = total as T[keyof T];
    }
    return next;
  });
}

export function filterRows(rows: BIRow[], filters: DashboardFilters): BIRow[] {
  const endTime = parseEndDateFilter(filters.endDate);
  return rows.filter((row) => {
    if (filters.investorType && row.investorType !== filters.investorType) return false;
    if (filters.investorGroupName && row.investorGroupName !== filters.investorGroupName) return false;
    if (filters.companyGroupCode && row.companyGroupCode !== filters.companyGroupCode) return false;
    if (filters.companyName && row.companyName !== filters.companyName) return false;
    if (filters.fundCurrencyCode && row.fundCurrencyCode !== filters.fundCurrencyCode) return false;
    if (endTime !== null) {
      if (!row.postingDate) return false;
      if (row.postingDate.getTime() > endTime) return false;
    }
    return true;
  });
}

function parseEndDateFilter(value: string): number | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const [, year, month, day] = match;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999);
    if (
      parsed.getFullYear() === Number(year) &&
      parsed.getMonth() === Number(month) - 1 &&
      parsed.getDate() === Number(day)
    ) {
      return parsed.getTime();
    }
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(23, 59, 59, 999);
  return parsed.getTime();
}

export function numericValue(row: BIRow, field: string): number {
  const key = fieldToKey(field) as NumericKey | null;
  return key ? Number(row[key] ?? 0) : 0;
}

function maxDate(rows: BIRow[]): Date | null {
  let latest: Date | null = null;
  for (const row of rows) {
    if (row.postingDate && (!latest || row.postingDate > latest)) latest = row.postingDate;
  }
  return latest;
}

function compareBuckets(a: Bucket<string>, b: Bucket<string>): number {
  const aTime = a.endDate?.getTime() ?? 0;
  const bTime = b.endDate?.getTime() ?? 0;
  return aTime - bTime || String(a.key).localeCompare(String(b.key));
}
