import { describe, expect, it } from 'vitest';
import type { BIRow } from '../types';
import {
  buildInvestorTimelines,
  classifyInvestorScenarios,
  classifyMetrics,
  deriveScenarioMetrics,
  metricIsActiveNetZero,
  moneySign,
  scenarioBucketsForInvestors,
  scenarioEverBucketsForInvestors,
  scenarioInvestorsByBucketId,
} from '../utils/scenarioClassifier';
import fixtureData from './fixtures/rreScenarioDetail.json';
import sheet1Data from './fixtures/rreSheet1Counts.json';

type FixtureRow = {
  fund: string | null;
  investorNo: string | null;
  shortCode: string | null;
  investorTotalCommitments: number;
  investorAvailableUnfundedCommitments: number;
  capitalAccountBalance: number;
  totalContributions: number;
  totalDistributions: number;
  recallableDistributions: number;
  expected: {
    cashFlow: string;
    commitment: string;
    ratio: string;
    totalValue: string;
    capitalAtWorkKey: string;
  };
};

const fixture = fixtureData as unknown as FixtureRow[];
const sheet1Counts = sheet1Data as unknown as Record<string, Record<string, number>>;

/** Build one synthetic BIRow per fixture investor with just the fields the classifier reads. */
function fixtureRows(): BIRow[] {
  return fixture.map((row, index) => ({
    investorKey: row.shortCode ?? `inv-${index}`,
    investorShortCode: row.shortCode,
    investorPortalDisplayName: row.shortCode,
    investorGroupName: row.fund,
    totalContributions: row.totalContributions,
    totalDistributions: row.totalDistributions,
    investorTotalCommitments: row.investorTotalCommitments,
    investorAvailableUnfundedCommitments: row.investorAvailableUnfundedCommitments,
    capitalAccountBalance: row.capitalAccountBalance,
    recallableDistributions: row.recallableDistributions,
  } as unknown as BIRow));
}

describe('classifyInvestorScenarios — reproduces RRE Scenarios.xlsx', () => {
  const model = classifyInvestorScenarios(fixtureRows());

  it('classifies all 473 workbook investors', () => {
    expect(fixture).toHaveLength(473);
    expect(Object.keys(model.recordByInvestor)).toHaveLength(473);
  });

  it('reproduces every per-investor scenario label exactly', () => {
    const mismatches: string[] = [];
    fixture.forEach((row, index) => {
      const key = row.shortCode ?? `inv-${index}`;
      const record = model.recordByInvestor[key];
      if (record.labels.cashFlow !== row.expected.cashFlow) mismatches.push(`${key} cashFlow: ${record.labels.cashFlow} != ${row.expected.cashFlow}`);
      if (record.labels.commitment !== row.expected.commitment) mismatches.push(`${key} commitment: ${record.labels.commitment} != ${row.expected.commitment}`);
      if (record.labels.ratio !== row.expected.ratio) mismatches.push(`${key} ratio: ${record.labels.ratio} != ${row.expected.ratio}`);
      if (record.labels.totalValue !== row.expected.totalValue) mismatches.push(`${key} totalValue: ${record.labels.totalValue} != ${row.expected.totalValue}`);
      if (record.signs.capitalAtWork.join('|') !== row.expected.capitalAtWorkKey) {
        mismatches.push(`${key} capitalAtWork: ${record.signs.capitalAtWork.join('|')} != ${row.expected.capitalAtWorkKey}`);
      }
    });
    expect(mismatches).toEqual([]);
  });

  it('matches Sheet1 bucket counts per visual', () => {
    for (const [visualId, expectedCounts] of Object.entries(sheet1Counts)) {
      const buckets = model.byVisual[visualId as keyof typeof model.byVisual];
      const actual = Object.fromEntries(buckets.map((bucket) => [bucket.label, bucket.count]));
      expect(actual).toEqual(expectedCounts);
    }
  });

  it('sorts each visual\'s buckets by count descending', () => {
    for (const buckets of Object.values(model.byVisual)) {
      const counts = buckets.map((bucket) => bucket.count);
      expect(counts).toEqual([...counts].sort((a, b) => b - a));
    }
  });

  it('scenarioInvestorsByBucketId maps every bucket to its members', () => {
    const byId = scenarioInvestorsByBucketId(model);
    for (const buckets of Object.values(model.byVisual)) {
      for (const bucket of buckets) {
        expect(byId[bucket.id]).toHaveLength(bucket.count);
      }
    }
  });

  it('scenarioBucketsForInvestors recomputes counts over a subset', () => {
    const cashFlowFull = model.byVisual.cashFlow;
    const subsetKeys = cashFlowFull[0].investorKeys.slice(0, 3); // first 3 of the largest bucket
    const subset = scenarioBucketsForInvestors(model, 'cashFlow', subsetKeys);
    expect(subset).toHaveLength(1);
    expect(subset[0].label).toBe(cashFlowFull[0].label);
    expect(subset[0].count).toBe(3);
  });
});

describe('gross offsetting detection — a net-zero 0 is not a no-activity 0', () => {
  function row(investorKey: string, over: Partial<BIRow>): BIRow {
    return {
      investorKey,
      investorShortCode: investorKey,
      investorPortalDisplayName: investorKey,
      investorGroupName: investorKey,
      companyName: 'Fund',
      totalContributions: 0,
      totalDistributions: 0,
      investorTotalCommitments: 0,
      investorAvailableUnfundedCommitments: 0,
      capitalAccountBalance: 0,
      recallableDistributions: 0,
      ...over,
    } as unknown as BIRow;
  }

  const model = classifyInvestorScenarios([
    // A commitment booked then fully reversed: nets to zero, but the entries exist.
    row('OFFSET', { investorTotalCommitments: 35_000_000 }),
    row('OFFSET', { investorTotalCommitments: -35_000_000 }),
    // No activity at all.
    row('EMPTY', {}),
  ]);

  it('classifies the offsetting investor as commitment 0 yet records the gross entries', () => {
    const record = model.recordByInvestor.OFFSET;
    expect(record.metrics.commitments).toBe(0);
    expect(record.signs.commitment[0]).toBe('0');
    expect(record.gross?.commitments).toEqual({ pos: 35_000_000, neg: -35_000_000 });
    expect(metricIsActiveNetZero(record.gross?.commitments)).toBe(true);
  });

  it('does not flag a genuinely empty metric as offsetting', () => {
    const record = model.recordByInvestor.EMPTY;
    expect(record.metrics.commitments).toBe(0);
    expect(metricIsActiveNetZero(record.gross?.commitments)).toBe(false);
  });
});

describe('scenario timeline — states across the life of the investment', () => {
  function qRow(investorKey: string, year: number, quarter: number, over: Partial<BIRow>): BIRow {
    return {
      investorKey,
      investorShortCode: investorKey,
      investorPortalDisplayName: investorKey,
      investorGroupName: investorKey,
      companyName: 'Fund',
      postingYear: year,
      postingQuarter: quarter,
      postingQuarterLabel: `${year} Q${quarter}`,
      totalContributions: 0,
      totalDistributions: 0,
      investorTotalCommitments: 0,
      investorAvailableUnfundedCommitments: 0,
      capitalAccountBalance: 0,
      recallableDistributions: 0,
      ...over,
    } as unknown as BIRow;
  }

  // A commitment booked in 2014, drawn down, then fully reversed in 2024.
  const rows = [
    qRow('LIFE', 2014, 1, { investorTotalCommitments: 5_000_000, investorAvailableUnfundedCommitments: 5_000_000 }),
    qRow('LIFE', 2016, 1, { investorAvailableUnfundedCommitments: -2_000_000 }),
    qRow('LIFE', 2024, 1, { investorTotalCommitments: -5_000_000, investorAvailableUnfundedCommitments: -3_000_000 }),
  ];
  const timelines = buildInvestorTimelines(rows);

  it('collapses cumulative quarters into spans and marks the latest as current', () => {
    const spans = timelines.LIFE.commitment;
    expect(spans).toHaveLength(2);
    expect(spans[0]).toMatchObject({
      label: 'Total Commitments + / Available Unfunded Commitments +',
      startQuarterLabel: '2014 Q1',
      endQuarterLabel: '2016 Q1',
      isCurrent: false,
    });
    expect(spans[1]).toMatchObject({
      label: 'Total Commitments 0 / Available Unfunded Commitments 0',
      startQuarterLabel: '2024 Q1',
      isCurrent: true,
    });
  });

  it('final span matches the snapshot classification (lifetime sum)', () => {
    const model = classifyInvestorScenarios(rows);
    const spans = model.timelineByInvestor.LIFE.commitment;
    expect(spans[spans.length - 1].label).toBe(model.recordByInvestor.LIFE.labels.commitment);
  });

  it('ever-in buckets count an investor in every scenario it passed through', () => {
    const ever = scenarioEverBucketsForInvestors(timelines, 'commitment', ['LIFE']);
    expect(ever.map((b) => b.label).sort()).toEqual([
      'Total Commitments + / Available Unfunded Commitments +',
      'Total Commitments 0 / Available Unfunded Commitments 0',
    ]);
    expect(ever.every((b) => b.count === 1)).toBe(true);
  });
});

describe('moneySign + derivations', () => {
  it('treats sub-cent residue as zero', () => {
    expect(moneySign(0)).toBe('0');
    expect(moneySign(0.004)).toBe('0');
    expect(moneySign(-0.004)).toBe('0');
    expect(moneySign(1)).toBe('+');
    expect(moneySign(-1)).toBe('-');
    expect(moneySign(Number.NaN)).toBe('0');
  });

  it('classifies an all-zero investor as all-zero on every visual', () => {
    const metrics = deriveScenarioMetrics({
      contributions: 0, distributions: 0, commitments: 0, unfunded: 0, capitalAccountBalance: 0, recallable: 0,
    });
    const classified = classifyMetrics(metrics);
    expect(classified.cashFlow.label).toBe('Contribution 0 / Distribution 0');
    expect(classified.capitalAtWork.signs.join('|')).toBe('0|0|0|0');
  });

  it('derives composites from base sums', () => {
    const metrics = deriveScenarioMetrics({
      contributions: -1000, distributions: 300, commitments: 1000, unfunded: 200, capitalAccountBalance: -700, recallable: 100,
    });
    expect(metrics.nonRecallable).toBe(200); // 300 - 100
    expect(metrics.totalValue).toBe(-400); // -700 + 300
    expect(metrics.calledCapital).toBe(800); // 1000 - 200
    expect(metrics.capitalAtWork).toBe(-1100); // -800 - 300
    expect(metrics.percentDeployed).toBeCloseTo(0.8); // 800 / 1000
  });
});
