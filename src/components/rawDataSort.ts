// Pure sort/match helpers for the raw-data table. Kept in their own module so
// RawDataTable.tsx exports only its component (React Fast Refresh stays happy)
// and so these helpers can be unit-tested directly.

export type SortDirection = 'asc' | 'desc';

// Numeric cells render with thousands separators ("-364,406.35"), but analysts
// paste or type plain values ("-364406.35"). Match both shapes by also
// comparing with separators stripped from haystack and needle.
export function textMatchesQuery(haystack: string, needle: string): boolean {
  if (haystack.includes(needle)) return true;
  if (!needle.includes(',') && !haystack.includes(',')) return false;
  return haystack.replace(/,/g, '').includes(needle.replace(/,/g, ''));
}

export function compareSortValues(left: unknown, right: unknown, direction: SortDirection): number {
  const multiplier = direction === 'asc' ? 1 : -1;
  if (left === right) return 0;
  // Blanks sink to the bottom in both directions — flipping to descending must
  // surface the largest values, never the empty cells.
  const leftEmpty = left === null || left === undefined || left === '';
  const rightEmpty = right === null || right === undefined || right === '';
  if (leftEmpty || rightEmpty) return leftEmpty && rightEmpty ? 0 : leftEmpty ? 1 : -1;
  if (left instanceof Date || right instanceof Date) {
    const leftTime = left instanceof Date ? left.getTime() : 0;
    const rightTime = right instanceof Date ? right.getTime() : 0;
    return (leftTime - rightTime) * multiplier;
  }
  if (typeof left === 'number' && typeof right === 'number') return (left - right) * multiplier;
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' }) * multiplier;
}
