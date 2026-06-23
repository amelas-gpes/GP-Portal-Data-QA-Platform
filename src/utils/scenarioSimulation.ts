import { FIELD_TO_HEADER, type NumericKey } from '../data/columns';
import type { BIRow, QuarterPoint } from '../types';
import { buildRowFlags } from './normalize';

// 'positive'/'negative' floor each row at the field's average magnitude (a
// sensitivity sweep). 'forcePositive'/'forceNegative' instead keep each row's
// own magnitude and only set the sign — magnitude-preserving, so a synthesized
// series keeps the real time-shape. The Scenario Gallery uses the latter pair;
// they are deliberately omitted from SCENARIO_POLARITY_OPTIONS (not user toggles).
export type ScenarioPolarity = 'current' | 'positive' | 'negative' | 'forcePositive' | 'forceNegative' | 'flip' | 'zero' | 'blank' | 'nonNumeric' | 'mixed';

export type ScenarioCategory =
  | 'ABS Sign Flip'
  | 'Blank / Missing'
  | 'Denominator Issue'
  | 'MAX Floor'
  | 'Mixed Period Values'
  | 'Negative'
  | 'Non-numeric'
  | 'Percent Over 100%'
  | 'Polarity Flip'
  | 'Positive'
  | 'Recallable Distribution Conflict'
  | 'Zero';

export type ScenarioOverrideMap = Partial<Record<NumericKey, ScenarioPolarity>>;
export type ScenarioCustomValueMap = Partial<Record<NumericKey, number>>;

export type ScenarioReviewPreset = {
  description: string;
  id: string;
  metricKey: string;
  name: string;
  overrides: ScenarioOverrideMap;
};

export type ScenarioSimulationMetric = {
  absUsed: boolean;
  chartElement: string;
  dataKey: keyof Pick<
    QuarterPoint,
    | 'capitalAccountBalance'
    | 'capitalAtWork'
    | 'commitments'
    | 'contributions'
    | 'distributions'
    | 'dpi'
    | 'nonRecallableDistributions'
    | 'percentDeployed'
    | 'totalValue'
    | 'tvpi'
    | 'unfundedCommitments'
  >;
  key: string;
  logicLinkLabel: string;
  metricName: string;
  mismatch: string | null;
  notes: string;
  sourceFields: NumericKey[];
  sourceLinkLabel: string;
  valueKind: 'currency' | 'multiple' | 'percent';
  visualId: string;
  visualName: string;
  workbookFormula: string;
  workbookMeaning: string;
  workbookRevisedFormula: string;
};

export const SCENARIO_POLARITY_OPTIONS: Array<{
  id: ScenarioPolarity;
  label: string;
  title: string;
}> = [
  { id: 'current', label: 'Keep', title: 'Leave this field as imported.' },
  { id: 'positive', label: 'Positive', title: 'Force each affected row to a positive value.' },
  { id: 'negative', label: 'Negative', title: 'Force each affected row to a negative value.' },
  { id: 'flip', label: 'Flip sign', title: 'Multiply each affected row by -1 while preserving row magnitudes.' },
  { id: 'zero', label: 'Zero', title: 'Force this field to zero.' },
  { id: 'blank', label: 'Blank', title: 'Simulate a blank or missing source value.' },
  { id: 'nonNumeric', label: 'Text', title: 'Simulate a non-numeric source value.' },
  { id: 'mixed', label: 'Mixed', title: 'Simulate mixed positive and negative rows.' },
];

export const PARTNER_TRANSFER_FIELDS = [
  'partnerTransfer',
  'partnerTransferInvestmentActivity',
  'partnerTransferContribution',
] as const satisfies readonly NumericKey[];

export const SCENARIO_REVIEW_PRESETS: ScenarioReviewPreset[] = [
  {
    id: 'standard-investor',
    name: 'Standard investor / normal activity',
    description: 'Uses imported values and keeps partner transfer fields empty.',
    metricKey: 'cashFlowSummary.Contributions',
    overrides: {
      partnerTransfer: 'zero',
      partnerTransferContribution: 'zero',
      partnerTransferInvestmentActivity: 'zero',
    },
  },
  {
    id: 'no-activity',
    name: 'Investor with no activity',
    description: 'Zeros the core LP movement fields to confirm empty visual behavior.',
    metricKey: 'cashFlowSummary.Contributions',
    overrides: {
      capitalAccountBalance: 'zero',
      investorAvailableUnfundedCommitments: 'zero',
      totalContributions: 'zero',
      totalDistributions: 'zero',
    },
  },
  {
    id: 'contributions-only',
    name: 'Investor with contributions only',
    description: 'Shows paid-in activity without distributions.',
    metricKey: 'cashFlowSummary.Contributions',
    overrides: {
      capitalAccountBalance: 'negative',
      totalContributions: 'negative',
      totalDistributions: 'zero',
    },
  },
  {
    id: 'distributions-only',
    name: 'Investor with distributions only',
    description: 'Shows distribution activity with no contribution movement.',
    metricKey: 'cashFlowSummary.Distributions',
    overrides: {
      capitalAccountBalance: 'zero',
      totalContributions: 'zero',
      totalDistributions: 'positive',
    },
  },
  {
    id: 'zero-contrib-zero-dist',
    name: 'Zero contributions and zero distributions',
    description: 'Targets ratios and cash flow charts with both paid-in and returned capital at zero.',
    metricKey: 'ratioAnalysis.DPI',
    overrides: {
      totalContributions: 'zero',
      totalDistributions: 'zero',
    },
  },
  {
    id: 'negative-capital-balance',
    name: 'Negative capital account balance',
    description: 'Forces a negative source NAV to confirm sign handling and total value behavior.',
    metricKey: 'totalValue.Capital Account Balance',
    overrides: {
      capitalAccountBalance: 'positive',
    },
  },
  {
    id: 'partner-transfer',
    name: 'Investor with partner transfer activity',
    description: 'Populates partner transfer fields and confirms Cash Flow Summary suppression.',
    metricKey: 'cashFlowSummary.Contributions',
    overrides: {
      partnerTransfer: 'positive',
      partnerTransferContribution: 'positive',
      partnerTransferInvestmentActivity: 'positive',
    },
  },
  {
    id: 'partner-transfer-empty',
    name: 'Partner transfer not populated',
    description: 'Clears transfer fields so Cash Flow Summary remains visible.',
    metricKey: 'cashFlowSummary.Contributions',
    overrides: {
      partnerTransfer: 'zero',
      partnerTransferContribution: 'zero',
      partnerTransferInvestmentActivity: 'zero',
    },
  },
  {
    id: 'mixed-positive-negative',
    name: 'Mixed positive and negative values',
    description: 'Alternates signs across contribution and distribution rows to expose netting.',
    metricKey: 'cashFlowSummary.Contributions',
    overrides: {
      totalContributions: 'mixed',
      totalDistributions: 'mixed',
    },
  },
  {
    id: 'ratio-zero-denominator',
    name: 'Ratio Analysis zero-denominator scenario',
    description: 'Zeros paid-in capital so Ratio Analysis renders 0 for charting.',
    metricKey: 'ratioAnalysis.TVPI',
    overrides: {
      capitalAccountBalance: 'negative',
      totalContributions: 'zero',
      totalDistributions: 'positive',
    },
  },
  {
    id: 'invalid-text-blank',
    name: 'Invalid data with text or blank values',
    description: 'Applies text and blank values to numeric source fields for validation messaging.',
    metricKey: 'ratioAnalysis.DPI',
    overrides: {
      totalContributions: 'nonNumeric',
      totalDistributions: 'blank',
    },
  },
];

export const SCENARIO_SIMULATION_METRICS: ScenarioSimulationMetric[] = [
  {
    key: 'cashFlowSummary.Contributions',
    visualId: 'cashFlowSummary',
    visualName: 'Cash Flow Summary',
    metricName: 'Contributions',
    chartElement: 'Area',
    workbookMeaning: 'Money the investor put into the fund, shown as positive.',
    workbookFormula: 'SUM(Total Contributions) * -1',
    workbookRevisedFormula: 'SUM(Total Contributions) * -1',
    absUsed: false,
    notes: 'Per quarter. Cumulative mode adds a running total.',
    sourceFields: ['totalContributions'],
    sourceLinkLabel: 'Total Contributions (AG)',
    logicLinkLabel: 'Visual Logic row 7',
    mismatch: null,
    dataKey: 'contributions',
    valueKind: 'currency',
  },
  {
    key: 'cashFlowSummary.Distributions',
    visualId: 'cashFlowSummary',
    visualName: 'Cash Flow Summary',
    metricName: 'Distributions',
    chartElement: 'Area',
    workbookMeaning: 'Money the fund paid back to the investor.',
    workbookFormula: 'SUM(Total Distributions)',
    workbookRevisedFormula: 'SUM(Total Distributions)',
    absUsed: false,
    notes: 'Per quarter. Cumulative mode adds a running total.',
    sourceFields: ['totalDistributions'],
    sourceLinkLabel: 'Total Distributions (AH)',
    logicLinkLabel: 'Visual Logic row 8',
    mismatch: null,
    dataKey: 'distributions',
    valueKind: 'currency',
  },
  {
    key: 'commitmentSummary.Commitments',
    visualId: 'commitmentSummary',
    visualName: 'Commitment Summary',
    metricName: 'Commitments',
    chartElement: 'Line',
    workbookMeaning: 'Total amount the investor has pledged to the fund.',
    workbookFormula: 'SUM(Investor Total Commitments)',
    workbookRevisedFormula: '-',
    absUsed: false,
    notes: 'Per quarter. Cumulative mode adds a running total.',
    sourceFields: ['investorTotalCommitments'],
    sourceLinkLabel: 'Investor Total Commitments (I)',
    logicLinkLabel: 'Visual Logic row 9',
    mismatch: null,
    dataKey: 'commitments',
    valueKind: 'currency',
  },
  {
    key: 'commitmentSummary.Unfunded Commitments',
    visualId: 'commitmentSummary',
    visualName: 'Commitment Summary',
    metricName: 'Unfunded Commitments',
    chartElement: 'Bar',
    workbookMeaning: 'Portion of the pledge not yet called by the fund.',
    workbookFormula: 'SUM(Investor Available Unfunded Commitments)',
    workbookRevisedFormula: '-',
    absUsed: false,
    notes: 'Per quarter. Cumulative mode adds a running total.',
    sourceFields: ['investorAvailableUnfundedCommitments'],
    sourceLinkLabel: 'Investor Available Unfunded Commitments (N)',
    logicLinkLabel: 'Visual Logic row 10',
    mismatch: null,
    dataKey: 'unfundedCommitments',
    valueKind: 'currency',
  },
  {
    key: 'ratioAnalysis.TVPI',
    visualId: 'ratioAnalysis',
    visualName: 'Ratio Analysis',
    metricName: 'TVPI',
    chartElement: 'Area',
    workbookMeaning: 'Total value to paid-in.',
    workbookFormula: '(Row 13 + Row 8) / Row 7',
    workbookRevisedFormula: '(Row 13 + Row 8) / Row 7',
    absUsed: false,
    notes: 'Renders as 0 if undefined or indeterminate. Rounded to 2 decimals.',
    sourceFields: ['capitalAccountBalance', 'totalDistributions', 'totalContributions'],
    sourceLinkLabel: 'Capital Account Balance (V); Total Distributions (AH); Total Contributions (AG)',
    logicLinkLabel: 'Visual Logic row 11',
    mismatch: null,
    dataKey: 'tvpi',
    valueKind: 'multiple',
  },
  {
    key: 'ratioAnalysis.DPI',
    visualId: 'ratioAnalysis',
    visualName: 'Ratio Analysis',
    metricName: 'DPI',
    chartElement: 'Area',
    workbookMeaning: 'Distributions to paid-in.',
    workbookFormula: 'Row 8 / Row 7',
    workbookRevisedFormula: 'Row 8 / Row 7',
    absUsed: false,
    notes: 'Defaults to 0 if undefined. Rounded to 2 decimals.',
    sourceFields: ['totalDistributions', 'totalContributions'],
    sourceLinkLabel: 'Total Distributions (AH); Total Contributions (AG)',
    logicLinkLabel: 'Visual Logic row 12',
    mismatch: null,
    dataKey: 'dpi',
    valueKind: 'multiple',
  },
  {
    key: 'totalValue.Capital Account Balance',
    visualId: 'totalValue',
    visualName: 'Total Value',
    metricName: 'Capital Account Balance',
    chartElement: 'Stacked Bar',
    workbookMeaning: 'Current NAV the investor holds in the fund.',
    workbookFormula: 'SUM(Capital Account Balance) * -1',
    workbookRevisedFormula: 'SUM(Capital Account Balance) * -1',
    absUsed: false,
    notes: 'Per quarter.',
    sourceFields: ['capitalAccountBalance'],
    sourceLinkLabel: 'Capital Account Balance (V)',
    logicLinkLabel: 'Visual Logic row 13',
    mismatch: null,
    dataKey: 'capitalAccountBalance',
    valueKind: 'currency',
  },
  {
    key: 'totalValue.Distributions',
    visualId: 'totalValue',
    visualName: 'Total Value',
    metricName: 'Distributions',
    chartElement: 'Stacked Bar',
    workbookMeaning: 'Cumulative cash already paid out.',
    workbookFormula: 'SUM(Row 8)',
    workbookRevisedFormula: 'SUM(Row 8)',
    absUsed: false,
    notes: 'Per quarter.',
    sourceFields: ['totalDistributions'],
    sourceLinkLabel: 'Total Distributions (AH)',
    logicLinkLabel: 'Visual Logic row 14',
    mismatch: null,
    dataKey: 'distributions',
    valueKind: 'currency',
  },
  {
    key: 'totalValue.Total Value',
    visualId: 'totalValue',
    visualName: 'Total Value',
    metricName: 'Total Value',
    chartElement: 'Scatter Dot',
    workbookMeaning: "Investor's total economic outcome to date.",
    workbookFormula: 'Row 8 + Row 13',
    workbookRevisedFormula: 'Row 8 + Row 13',
    absUsed: false,
    notes: 'Revised distribution and NAV component values are summed directly.',
    sourceFields: ['capitalAccountBalance', 'totalDistributions'],
    sourceLinkLabel: 'Capital Account Balance (V); Total Distributions (AH)',
    logicLinkLabel: 'Visual Logic row 15',
    mismatch: null,
    dataKey: 'totalValue',
    valueKind: 'currency',
  },
  {
    key: 'capitalAtWork.Capital At Work',
    visualId: 'capitalAtWork',
    visualName: 'Capital At Work',
    metricName: 'Capital At Work',
    chartElement: 'Solid Line',
    workbookMeaning: 'Net capital currently deployed, floored at zero.',
    workbookFormula: 'MAX(Row 7 - Row 8, 0)',
    workbookRevisedFormula: 'MAX(Row 7 - Row 8, 0)',
    absUsed: false,
    notes: 'Per-period uses last entry; cumulative mode uses running totals.',
    sourceFields: ['totalContributions', 'totalDistributions'],
    sourceLinkLabel: 'Total Contributions (AG); Total Distributions (AH)',
    logicLinkLabel: 'Visual Logic row 16',
    mismatch: null,
    dataKey: 'capitalAtWork',
    valueKind: 'currency',
  },
  {
    key: 'capitalAtWork.Commitments',
    visualId: 'capitalAtWork',
    visualName: 'Capital At Work',
    metricName: 'Commitments',
    chartElement: 'Dashed Line',
    workbookMeaning: 'Total pledge reference line.',
    workbookFormula: 'SUM(Investor Total Commitments)',
    workbookRevisedFormula: 'SUM(Row 4)',
    absUsed: false,
    notes: 'Per quarter.',
    sourceFields: ['investorTotalCommitments'],
    sourceLinkLabel: 'Investor Total Commitments (I)',
    logicLinkLabel: 'Visual Logic row 17',
    mismatch: null,
    dataKey: 'commitments',
    valueKind: 'currency',
  },
  {
    key: 'capitalAtWork.Percent Deployed',
    visualId: 'capitalAtWork',
    visualName: 'Capital At Work',
    metricName: 'Percent Deployed',
    chartElement: 'Tooltip only',
    workbookMeaning: 'Share of pledge currently at work.',
    workbookFormula: 'Capital At Work / Commitments',
    workbookRevisedFormula: 'Row 16 / Row 17',
    absUsed: false,
    notes: 'Falls back to contributions if no commitments. Floored at zero.',
    sourceFields: ['totalContributions', 'totalDistributions', 'investorTotalCommitments'],
    sourceLinkLabel: 'Capital At Work derived; Investor Total Commitments (I); Total Contributions (AG)',
    logicLinkLabel: 'Visual Logic row 18',
    mismatch: null,
    dataKey: 'percentDeployed',
    valueKind: 'percent',
  },
  {
    key: 'capitalAtWork.Non-Recallable Distributions',
    visualId: 'capitalAtWork',
    visualName: 'Capital At Work',
    metricName: 'Non-Recallable Distributions',
    chartElement: 'Tooltip only',
    workbookMeaning: 'Distributions the fund cannot call back.',
    workbookFormula: 'Total Distributions - Recallable Distributions',
    workbookRevisedFormula: 'Row 8 - Recallable Distributions',
    absUsed: false,
    notes: 'Tooltip-only value.',
    sourceFields: ['totalDistributions', 'recallableDistributions'],
    sourceLinkLabel: 'Total Distributions (AH); Recallable Distributions (K)',
    logicLinkLabel: 'Visual Logic row 19',
    mismatch: null,
    dataKey: 'nonRecallableDistributions',
    valueKind: 'currency',
  },
];

const EPSILON = 1e-6;

export function applyScenarioOverrides(
  rows: BIRow[],
  fields: readonly NumericKey[],
  overrides: ScenarioOverrideMap,
  periodKey: string,
): BIRow[] {
  const targetIndexes = new Set<number>();
  rows.forEach((row, index) => {
    if (periodKey === 'all' || row.postingQuarterLabel === periodKey) targetIndexes.add(index);
  });
  if (!targetIndexes.size || !fields.some((field) => overrideForField(overrides, field) !== 'current')) return rows;

  const fallbackMagnitudeByField = new Map(fields.map((field) => [field, fallbackMagnitude(rows, field)]));
  return rows.map((row, index) => {
    if (!targetIndexes.has(index)) return row;
    let next: BIRow | null = null;
    for (const field of fields) {
      const override = overrideForField(overrides, field);
      if (override === 'current') continue;
      if (!next) next = { ...row, raw: { ...row.raw }, flags: { ...row.flags } };
      const value = simulatedFieldValue(
        Number(row[field] ?? 0),
        fallbackMagnitudeByField.get(field) ?? 1_000,
        override,
        index,
      );
      next[field] = value as BIRow[typeof field];
      next.raw[FIELD_TO_HEADER[field] ?? field] = override === 'blank' ? null : override === 'nonNumeric' ? 'Non-numeric scenario value' : value;
    }
    if (!next) return row;
    next.flags = buildRowFlags(next);
    return next;
  });
}

export function applyScenarioCustomValues(
  rows: BIRow[],
  fields: readonly NumericKey[],
  customValues: ScenarioCustomValueMap,
  periodKey: string,
): BIRow[] {
  const activeFields = fields.filter((field) => Number.isFinite(customValues[field]));
  if (!activeFields.length) return rows;

  const targetIndexes = new Set<number>();
  rows.forEach((row, index) => {
    if (periodKey === 'all' || row.postingQuarterLabel === periodKey) targetIndexes.add(index);
  });
  if (!targetIndexes.size) return rows;

  return rows.map((row, index) => {
    if (!targetIndexes.has(index)) return row;
    let next: BIRow | null = null;
    for (const field of activeFields) {
      const customValue = customValues[field];
      if (!Number.isFinite(customValue)) continue;
      if (!next) next = { ...row, raw: { ...row.raw }, flags: { ...row.flags } };
      next[field] = customValue as BIRow[typeof field];
      next.raw[FIELD_TO_HEADER[field] ?? field] = customValue;
    }
    if (!next) return row;
    next.flags = buildRowFlags(next);
    return next;
  });
}

export function availableScenarioPeriods(rows: readonly BIRow[]): string[] {
  const periods = new Set<string>();
  for (const row of rows) {
    if (row.postingQuarterLabel) periods.add(row.postingQuarterLabel);
  }
  return Array.from(periods).sort(compareQuarterLabels);
}

export function scenarioRowsForPoint(rows: readonly BIRow[], periodKey: string, cumulative: boolean): BIRow[] {
  if (periodKey === 'all') return [...rows];
  if (!cumulative) return rows.filter((row) => row.postingQuarterLabel === periodKey);
  const selectedEnd = maxDate(rows.filter((row) => row.postingQuarterLabel === periodKey));
  if (!selectedEnd) return rows.filter((row) => row.postingQuarterLabel === periodKey);
  return rows.filter((row) => row.postingDate && row.postingDate <= selectedEnd);
}

export function classifyScenario(
  metric: ScenarioSimulationMetric,
  rows: readonly BIRow[],
  value: number,
  overrides: ScenarioOverrideMap,
): ScenarioCategory {
  const activeOverrides = metric.sourceFields.map((field) => overrideForField(overrides, field));
  if (activeOverrides.includes('nonNumeric')) return 'Non-numeric';
  if (activeOverrides.includes('blank')) return 'Blank / Missing';
  if (hasDenominatorIssue(metric, rows)) return 'Denominator Issue';
  if (metric.key === 'capitalAtWork.Percent Deployed' && value > 1 + EPSILON) return 'Percent Over 100%';
  if (metric.key === 'capitalAtWork.Non-Recallable Distributions' && sum(rows, 'recallableDistributions') > distributionSum(rows) + EPSILON) {
    return 'Recallable Distribution Conflict';
  }
  if (metric.key === 'capitalAtWork.Capital At Work' && capitalAtWorkRaw(rows) < -EPSILON) return 'MAX Floor';
  if (activeOverrides.includes('flip')) return 'Polarity Flip';
  if (activeOverrides.includes('mixed') || metric.sourceFields.some((field) => hasMixedSigns(rows, field))) return 'Mixed Period Values';
  if (metric.absUsed && metric.sourceFields.some((field) => sum(rows, field) < -EPSILON) && value >= 0) return 'ABS Sign Flip';
  if (activeOverrides.includes('negative')) return 'Negative';
  if (activeOverrides.includes('positive')) return 'Positive';
  if (value > EPSILON) return 'Positive';
  if (value < -EPSILON) return 'Negative';
  return 'Zero';
}

export function hasPartnerTransferActivity(rows: readonly BIRow[]): boolean {
  return PARTNER_TRANSFER_FIELDS.some((field) => Math.abs(sum(rows, field)) > EPSILON);
}

export function hasScenarioDenominatorIssue(metric: ScenarioSimulationMetric, rows: readonly BIRow[]): boolean {
  return hasDenominatorIssue(metric, rows);
}

export function scenarioCategoryTone(category: ScenarioCategory): 'neutral' | 'good' | 'warn' | 'bad' {
  if (category === 'Positive' || category === 'Zero') return 'good';
  if (category === 'Negative' || category === 'Denominator Issue' || category === 'Non-numeric') return 'bad';
  if (category === 'Blank / Missing' || category === 'MAX Floor' || category === 'Percent Over 100%' || category === 'Recallable Distribution Conflict') return 'warn';
  return 'neutral';
}

export function scenarioNarrative(metric: ScenarioSimulationMetric, category: ScenarioCategory): { behavior: string; scenario: string } {
  switch (category) {
    case 'ABS Sign Flip':
      return {
        scenario: `${metric.metricName} source sign is being hidden or flipped by sign handling.`,
        behavior: `The ${metric.visualName} visual would show a positive-looking value even though the source field is negative.`,
      };
    case 'Blank / Missing':
      return {
        scenario: `${metric.metricName} has a blank or missing source value.`,
        behavior: 'The visual may show zero or omit the value depending on the formula path.',
      };
    case 'Denominator Issue':
      return {
        scenario: `${metric.metricName} is using a zero or unsafe denominator.`,
        behavior: metric.visualId === 'ratioAnalysis'
          ? 'Ratio Analysis renders 0 for charting when the denominator is 0 or indeterminate.'
          : 'The visual may default or look stable even though the source math is not safe.',
      };
    case 'MAX Floor':
      return {
        scenario: `${metric.metricName} calculates below zero before the floor is applied.`,
        behavior: 'The visual would show zero because MAX keeps the line from going negative.',
      };
    case 'Mixed Period Values':
      return {
        scenario: `${metric.metricName} has mixed positive and negative source rows.`,
        behavior: 'The visual shows the net result, which can hide offsetting activity.',
      };
    case 'Negative':
      return {
        scenario: `${metric.metricName} becomes negative.`,
        behavior: `The ${metric.visualName} visual would need sign-aware review.`,
      };
    case 'Non-numeric':
      return {
        scenario: `${metric.metricName} receives a non-numeric source value.`,
        behavior: 'The visual formula may fail, default, or omit the value.',
      };
    case 'Percent Over 100%':
      return {
        scenario: `${metric.metricName} exceeds 100%.`,
        behavior: 'The investor would see more than the full commitment deployed.',
      };
    case 'Polarity Flip':
      return {
        scenario: `${metric.metricName} source polarity is inverted.`,
        behavior: 'The simulator reverses each affected row sign while preserving the original row magnitudes.',
      };
    case 'Positive':
      return {
        scenario: `${metric.metricName} is positive.`,
        behavior: `The ${metric.visualName} visual would show an active positive value.`,
      };
    case 'Recallable Distribution Conflict':
      return {
        scenario: 'Recallable distributions exceed total distributions.',
        behavior: 'Non-recallable distributions may calculate below zero.',
      };
    case 'Zero':
      return {
        scenario: `${metric.metricName} is zero or has no movement.`,
        behavior: `The ${metric.visualName} visual would show no visible movement for this value.`,
      };
  }
}

export function fieldDisplayName(field: NumericKey): string {
  return FIELD_TO_HEADER[field] ?? field;
}

function overrideForField(overrides: ScenarioOverrideMap, field: NumericKey): ScenarioPolarity {
  return overrides[field] ?? 'current';
}

function simulatedFieldValue(currentValue: number, fallbackMagnitude: number, override: ScenarioPolarity, rowIndex: number): number {
  const magnitude = Math.max(Math.abs(currentValue), fallbackMagnitude);
  switch (override) {
    case 'positive':
      return magnitude;
    case 'negative':
      return -magnitude;
    case 'forcePositive':
      return Math.abs(currentValue);
    case 'forceNegative':
      return -Math.abs(currentValue);
    case 'flip':
      return -currentValue;
    case 'zero':
    case 'blank':
    case 'nonNumeric':
      return 0;
    case 'mixed':
      return rowIndex % 2 === 0 ? magnitude : -magnitude;
    case 'current':
      return currentValue;
  }
}

function fallbackMagnitude(rows: readonly BIRow[], field: NumericKey): number {
  const nonZero = rows.map((row) => Math.abs(Number(row[field] ?? 0))).filter((value) => value > EPSILON);
  if (!nonZero.length) return 100_000;
  const average = nonZero.reduce((sumValue, value) => sumValue + value, 0) / nonZero.length;
  return Math.max(1_000, average);
}

function compareQuarterLabels(left: string, right: string): number {
  const leftMatch = left.match(/^(\d{4}) Q([1-4])$/);
  const rightMatch = right.match(/^(\d{4}) Q([1-4])$/);
  if (leftMatch && rightMatch) {
    const leftValue = Number(leftMatch[1]) * 10 + Number(leftMatch[2]);
    const rightValue = Number(rightMatch[1]) * 10 + Number(rightMatch[2]);
    return leftValue - rightValue;
  }
  return left.localeCompare(right);
}

function maxDate(rows: readonly BIRow[]): Date | null {
  let latest: Date | null = null;
  for (const row of rows) {
    if (row.postingDate && (!latest || row.postingDate > latest)) latest = row.postingDate;
  }
  return latest;
}

function hasDenominatorIssue(metric: ScenarioSimulationMetric, rows: readonly BIRow[]): boolean {
  if (metric.key === 'ratioAnalysis.TVPI' || metric.key === 'ratioAnalysis.DPI') {
    return Math.abs(contributionDenominator(rows)) < EPSILON;
  }
  if (metric.key === 'capitalAtWork.Percent Deployed') {
    return Math.abs(sum(rows, 'investorTotalCommitments')) < EPSILON;
  }
  return false;
}

function contributionDenominator(rows: readonly BIRow[]): number {
  return sum(rows, 'totalContributions') * -1;
}

function capitalAtWorkRaw(rows: readonly BIRow[]): number {
  return contributionDenominator(rows) - distributionSum(rows);
}

function distributionSum(rows: readonly BIRow[]): number {
  return sum(rows, 'totalDistributions');
}

function hasMixedSigns(rows: readonly BIRow[], field: NumericKey): boolean {
  let hasPositive = false;
  let hasNegative = false;
  for (const row of rows) {
    const value = Number(row[field] ?? 0);
    if (value > EPSILON) hasPositive = true;
    if (value < -EPSILON) hasNegative = true;
    if (hasPositive && hasNegative) return true;
  }
  return false;
}

function sum(rows: readonly BIRow[], field: NumericKey): number {
  return rows.reduce((total, row) => total + Number(row[field] ?? 0), 0);
}
