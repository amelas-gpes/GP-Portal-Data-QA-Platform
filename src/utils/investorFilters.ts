import type { DashboardFilters, InvestorOption } from '../types';

export type SelectFacetId = 'investorType' | 'investorGroupName' | 'companyGroupCode' | 'companyName' | 'fundCurrencyCode';

export type FacetOption = { value: string; count: number };

const FACET_ACCESSORS: Record<SelectFacetId, (option: InvestorOption) => string | null> = {
  investorType: (option) => option.investorType,
  investorGroupName: (option) => option.investorGroupName,
  companyGroupCode: (option) => option.companyGroupCode,
  companyName: (option) => option.companyName,
  fundCurrencyCode: (option) => option.fundCurrencyCode,
};

/**
 * Faceted-search options for the TopBar selects: each facet's choices come from
 * the investors that pass every OTHER active filter (its own value cleared, the
 * standard cascade semantic), with match counts. Values that would yield zero
 * investors are dropped — except the currently selected value, which stays
 * listed at (0) so the select never shows a phantom.
 */
export function cascadeSelectOptions(
  investors: InvestorOption[],
  filters: DashboardFilters,
  query: string,
  scenarioInvestorsById: Record<string, string[]>,
): Record<SelectFacetId, FacetOption[]> {
  const result = {} as Record<SelectFacetId, FacetOption[]>;
  for (const facet of Object.keys(FACET_ACCESSORS) as SelectFacetId[]) {
    const accessor = FACET_ACCESSORS[facet];
    const matching = filterInvestors(investors, { ...filters, [facet]: '' }, query, scenarioInvestorsById);
    const counts = new Map<string, number>();
    for (const option of matching) {
      const value = accessor(option);
      if (!value) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const selected = filters[facet];
    if (selected && !counts.has(selected)) counts.set(selected, 0);
    result[facet] = [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value));
  }
  return result;
}

export function filterInvestors(
  investors: InvestorOption[],
  filters: DashboardFilters,
  query: string,
  scenarioInvestorsById: Record<string, string[]>,
): InvestorOption[] {
  const lowered = query.trim().toLowerCase();
  const scenarioSet = filters.scenarioId ? new Set(scenarioInvestorsById[filters.scenarioId] ?? []) : null;
  return investors.filter((option) => {
    if (scenarioSet && !scenarioSet.has(option.key)) return false;
    if (filters.investorType && option.investorType !== filters.investorType) return false;
    if (filters.investorGroupName && option.investorGroupName !== filters.investorGroupName) return false;
    if (filters.companyGroupCode && option.companyGroupCode !== filters.companyGroupCode) return false;
    if (filters.companyName && option.companyName !== filters.companyName) return false;
    if (filters.fundCurrencyCode && option.fundCurrencyCode !== filters.fundCurrencyCode) return false;
    if (!lowered) return true;
    return [
      option.investorPortalDisplayName,
      option.investorGroupName,
      option.investorNo,
      option.investorShortCode,
      option.companyName,
      option.companyGroupCode,
      option.label,
    ]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(lowered));
  });
}
