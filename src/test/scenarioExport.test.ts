import { describe, expect, it } from 'vitest';
import type { InvestorScenarioRecord } from '../types';
import { SCENARIO_MEMBERS_COLUMNS, buildScenarioMembersCsv } from '../utils/scenarioExport';

function record(over: Partial<InvestorScenarioRecord> & { metrics?: Partial<InvestorScenarioRecord['metrics']> } = {}): InvestorScenarioRecord {
  return {
    investorKey: over.investorKey ?? 'SYN00001',
    shortCode: over.shortCode ?? 'SYN00001',
    portalName: over.portalName ?? 'Northwind Partners, LLC',
    fund: over.fund ?? 'Northwind Growth Fund, L.P.',
    rowCount: 1,
    metrics: {
      contributions: -2500000, distributions: 2400000, commitments: 2650000, unfunded: 50000,
      capitalAccountBalance: -1300000, recallable: 100000, nonRecallable: 2300000,
      totalValue: 1100000, calledCapital: 2600000, capitalAtWork: -2600000, percentDeployed: 0.98,
      ...over.metrics,
    },
    labels: {
      cashFlow: 'Contribution - / Distribution +', commitment: '', ratio: '', totalValue: '', capitalAtWork: '',
    },
    signs: { cashFlow: [], commitment: [], ratio: [], totalValue: [], capitalAtWork: [] },
  };
}

describe('buildScenarioMembersCsv', () => {
  const csv = buildScenarioMembersCsv({
    visualTitle: 'Cash Flow',
    scenarioLabel: 'Contribution - / Distribution +',
    records: [record(), record({ investorKey: 'SYN00002', shortCode: 'SYN00002', portalName: 'Cedar Family Trust' })],
  });
  const lines = csv.split('\r\n');

  it('leads with the visual + scenario context', () => {
    expect(lines[0]).toBe('Visual,Scenario,Investors');
    expect(lines[1]).toBe('Cash Flow,Contribution - / Distribution +,2');
  });

  it('uses exactly the table columns', () => {
    expect(lines[3]).toBe(SCENARIO_MEMBERS_COLUMNS.join(','));
    expect(SCENARIO_MEMBERS_COLUMNS).toEqual([
      'Short Code', 'Investor', 'Fund', 'Contributions', 'Distributions', 'Commitments', 'Capital Account', 'Total Value',
    ]);
  });

  it('emits one row per member with the shown metric values', () => {
    expect(lines[4]).toBe('SYN00001,"Northwind Partners, LLC","Northwind Growth Fund, L.P.",-2500000,2400000,2650000,-1300000,1100000');
    expect(lines).toHaveLength(6); // context(2) + blank + header + 2 members
  });
});
