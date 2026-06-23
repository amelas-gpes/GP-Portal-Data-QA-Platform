import { describe, expect, it } from 'vitest';
import type { DashboardFilters, InvestorOption } from '../types';
import { cascadeSelectOptions } from '../utils/investorFilters';

const baseFilters: DashboardFilters = {
  investorType: '',
  investorGroupName: '',
  companyGroupCode: '',
  companyName: '',
  fundCurrencyCode: '',
  endDate: '',
  cumulative: true,
  groupingMode: 'investorFundPairing',
  scenarioId: '',
};

function investor(overrides: Partial<InvestorOption> & { key: string }): InvestorOption {
  return {
    label: overrides.key,
    investorPortalDisplayName: null,
    investorGroupName: null,
    investorNo: null,
    investorShortCode: null,
    companyName: null,
    companyGroupCode: null,
    fundCurrencyCode: null,
    investorType: 'LP',
    rowCount: 1,
    ...overrides,
  };
}

const INVESTORS: InvestorOption[] = [
  investor({ key: 'a', investorGroupName: 'Alpine', companyName: 'Growth Fund I', companyGroupCode: 'GF1', fundCurrencyCode: 'USD', investorType: 'LP' }),
  investor({ key: 'b', investorGroupName: 'Blue Harbor', companyName: 'Growth Fund I', companyGroupCode: 'GF1', fundCurrencyCode: 'USD', investorType: 'LP' }),
  investor({ key: 'c', investorGroupName: 'Cedarwood', companyName: 'Real Estate Fund', companyGroupCode: 'REF', fundCurrencyCode: 'EUR', investorType: 'LP' }),
  investor({ key: 'd', investorGroupName: 'GP Principals', companyName: 'Real Estate Fund', companyGroupCode: 'REF', fundCurrencyCode: 'EUR', investorType: 'GP' }),
];

describe('cascadeSelectOptions', () => {
  it('lists all values with counts when no filters are active', () => {
    const options = cascadeSelectOptions(INVESTORS, baseFilters, '', {});
    expect(options.companyName).toEqual([
      { value: 'Growth Fund I', count: 2 },
      { value: 'Real Estate Fund', count: 2 },
    ]);
    expect(options.investorType).toEqual([
      { value: 'GP', count: 1 },
      { value: 'LP', count: 3 },
    ]);
  });

  it('narrows other facets by an active filter but never its own', () => {
    const filters = { ...baseFilters, companyName: 'Real Estate Fund' };
    const options = cascadeSelectOptions(INVESTORS, filters, '', {});
    // Currency cascades: only EUR is reachable under Real Estate Fund.
    expect(options.fundCurrencyCode).toEqual([{ value: 'EUR', count: 2 }]);
    // The company facet itself stays wide open (self-exclusion).
    expect(options.companyName.map((option) => option.value)).toEqual(['Growth Fund I', 'Real Estate Fund']);
  });

  it('keeps a selected value visible at zero count instead of dropping it', () => {
    const filters = { ...baseFilters, companyName: 'Real Estate Fund', fundCurrencyCode: 'USD' };
    const options = cascadeSelectOptions(INVESTORS, filters, '', {});
    // USD has no Real Estate Fund investors, but it is selected — keep it at 0.
    expect(options.fundCurrencyCode).toEqual([
      { value: 'EUR', count: 2 },
      { value: 'USD', count: 0 },
    ]);
  });

  it('cascades the scenario filter and search query too', () => {
    const scenarioInvestors = { 'scn-1': ['c', 'd'] };
    const filters = { ...baseFilters, scenarioId: 'scn-1' };
    const scenarioScoped = cascadeSelectOptions(INVESTORS, filters, '', scenarioInvestors);
    expect(scenarioScoped.companyName).toEqual([{ value: 'Real Estate Fund', count: 2 }]);

    const searched = cascadeSelectOptions(INVESTORS, baseFilters, 'alpine', {});
    expect(searched.companyName).toEqual([{ value: 'Growth Fund I', count: 1 }]);
  });
});
