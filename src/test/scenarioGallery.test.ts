import { describe, expect, it } from 'vitest';
import { cloneFormulaRegistry } from '../data/defaultLogic';
import type { BIRow } from '../types';
import { normalizeBIRow } from '../utils/normalize';
import { classifyInvestorScenarios } from '../utils/scenarioClassifier';
import { buildGallery, scenarioSlug } from '../utils/scenarioGallery';

type Vals = { commit: number; unfunded: number; contrib: number; distrib: number; cab: number; recall: number };

function makeRow(code: string, date: string, v: Vals, rowId: number): BIRow {
  return normalizeBIRow({
    'Company Name': 'Fund A',
    'Investor No_': code,
    'Investor Short Code': code,
    'Investor Group Name': code,
    'Posting Date': date,
    'Investor Total Commitments': v.commit,
    'Investor Available Unfunded Commitments': v.unfunded,
    'Total Contributions': v.contrib,
    'Total Distributions': v.distrib,
    'Capital Account Balance': v.cab,
    'Recallable Distributions': v.recall,
  }, rowId);
}

// One LP paid in and distributing, across three quarters.
function baseInvestorRows(): BIRow[] {
  let id = 1;
  return [
    makeRow('INVA', '2020-03-31', { commit: 10_000_000, unfunded: 6_000_000, contrib: -4_000_000, distrib: 500_000, cab: -3_500_000, recall: 0 }, id++),
    makeRow('INVA', '2021-03-31', { commit: 0, unfunded: -2_000_000, contrib: -3_000_000, distrib: 1_500_000, cab: -1_500_000, recall: 100_000 }, id++),
    makeRow('INVA', '2022-03-31', { commit: 0, unfunded: -1_000_000, contrib: -2_000_000, distrib: 2_000_000, cab: -1_000_000, recall: 0 }, id++),
  ];
}

describe('buildGallery', () => {
  const baseRows = baseInvestorRows();
  const formulas = cloneFormulaRegistry();
  const baseRecord = Object.values(classifyInvestorScenarios(baseRows).recordByInvestor)[0];

  it('enumerates the full sign space for two-input visuals', () => {
    const commitment = buildGallery('commitment', baseRows, formulas, 'production', true);
    expect(commitment.scenarios).toHaveLength(9);
  });

  it('enumerates all 27 combinations for a three-input visual', () => {
    const ratio = buildGallery('ratio', baseRows, formulas, 'production', true);
    expect(ratio.scenarios).toHaveLength(27);
  });

  it('marks exactly one scenario as the investor\'s actual, matching its classification', () => {
    const gallery = buildGallery('commitment', baseRows, formulas, 'production', true);
    const actual = gallery.scenarios.filter((scenario) => scenario.actual);
    expect(actual).toHaveLength(1);
    expect(actual[0].label).toBe(baseRecord.labels.commitment);
    // Actual sorts first.
    expect(gallery.scenarios[0].actual).toBe(true);
    expect(gallery.scenarios.slice(1).every((scenario) => !scenario.actual)).toBe(true);
  });

  it('renders a non-empty series for every scenario, even synthetic ones', () => {
    for (const visualId of ['cashFlow', 'commitment', 'ratio', 'totalValue', 'capitalAtWork'] as const) {
      const gallery = buildGallery(visualId, baseRows, formulas, 'production', true);
      expect(gallery.scenarios.length).toBeGreaterThan(0);
      expect(gallery.scenarios.filter((scenario) => scenario.actual)).toHaveLength(1);
      for (const scenario of gallery.scenarios) {
        expect(scenario.quarterSeries.length).toBeGreaterThan(0);
      }
    }
  });

  it('builds stable, filesystem-safe slugs', () => {
    expect(scenarioSlug('commitment', ['+', '+'])).toBe('commitment-pos-pos');
    expect(scenarioSlug('ratio', ['-', '0', '+'])).toBe('ratio-neg-0-pos');
  });
});
