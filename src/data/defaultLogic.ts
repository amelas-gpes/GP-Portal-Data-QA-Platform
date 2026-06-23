import type { FormulaMetric, FormulaRegistry } from '../types';

const metric = (
  visualId: string,
  visualName: string,
  metricName: string,
  chartElement: string,
  productionFormula: string,
  sourceFields: string[],
  options: {
    revisedFormula?: string;
    absUsed?: boolean;
    behavior?: string;
    edgeCase?: string;
  } = {},
): FormulaMetric => {
  const id = `${visualId}.${metricName}`;
  return {
    id,
    visualId,
    visualName,
    metricName,
    chartElement,
    productionFormula,
    draftFormula: productionFormula,
    revisedFormula: options.revisedFormula,
    sourceFields,
    absUsed: Boolean(options.absUsed),
    behavior: options.behavior ?? 'Per selected bucket; cumulative mode uses rows through the bucket.',
    edgeCase: options.edgeCase ?? 'Invalid formulas keep the last valid output visible.',
  };
};

const metrics: FormulaMetric[] = [
  metric('cashFlowSummary', 'Cash Flow Summary', 'Contributions', 'Area', 'SUM("Total Contributions") * -1', ['Total Contributions'], {
    behavior: 'Quarterly; cumulative toggle converts to running totals.',
  }),
  metric('cashFlowSummary', 'Cash Flow Summary', 'Distributions', 'Area', 'SUM("Total Distributions")', ['Total Distributions'], {
    behavior: 'Quarterly; cumulative toggle converts to running totals.',
  }),
  metric('commitmentSummary', 'Commitment Summary', 'Commitments', 'Line', 'SUM("Investor Total Commitments")', ['Investor Total Commitments'], {
    behavior: 'Quarterly commitment reference; cumulative mode uses rows through selected quarter.',
  }),
  metric('commitmentSummary', 'Commitment Summary', 'Unfunded Commitments', 'Bar', 'SUM("Investor Available Unfunded Commitments")', ['Investor Available Unfunded Commitments']),
  metric(
    'ratioAnalysis',
    'Ratio Analysis',
    'TVPI',
    'Area',
    'ROUND(SAFE_DIVIDE(SUM("Capital Account Balance") * -1 + SUM("Total Distributions"), SUM("Total Contributions") * -1, 0), 2)',
    ['Capital Account Balance', 'Total Distributions', 'Total Contributions'],
    {
      edgeCase: 'Returns 0.00 if denominator is zero, undefined, or infinite.',
    },
  ),
  metric('ratioAnalysis', 'Ratio Analysis', 'DPI', 'Area', 'ROUND(SAFE_DIVIDE(SUM("Total Distributions"), SUM("Total Contributions") * -1, 0), 2)', ['Total Distributions', 'Total Contributions'], {
    edgeCase: 'Returns 0.00 if denominator is zero or undefined.',
  }),
  metric('totalValue', 'Total Value', 'Capital Account Balance', 'Stacked Bar', 'SUM("Capital Account Balance") * -1', ['Capital Account Balance']),
  metric('totalValue', 'Total Value', 'Distributions', 'Stacked Bar', 'SUM("Total Distributions")', ['Total Distributions']),
  metric(
    'totalValue',
    'Total Value',
    'Total Value',
    'Marker',
    'METRIC("Distributions") + METRIC("Capital Account Balance")',
    ['Capital Account Balance', 'Total Distributions'],
    {
      edgeCase: 'Uses the revised distribution and NAV component values before summing.',
    },
  ),
  metric('capitalAtWork', 'Capital At Work', 'Capital At Work', 'Solid Line', 'MAX(SUM("Total Contributions") * -1 - SUM("Total Distributions"), 0)', ['Total Contributions', 'Total Distributions'], {
    behavior: 'Defaults to cumulative mode for the LP capital deployed view.',
  }),
  metric('capitalAtWork', 'Capital At Work', 'Commitments', 'Dashed Line', 'SUM("Investor Total Commitments")', ['Investor Total Commitments']),
  metric('capitalAtWork', 'Capital At Work', 'Percent Deployed', 'Tooltip', 'IF(METRIC("Commitments") > 0, MAX(SAFE_DIVIDE(METRIC("Capital At Work"), METRIC("Commitments"), 0), 0), MAX(SAFE_DIVIDE(METRIC("Capital At Work"), SUM("Total Contributions") * -1, 0), 0))', ['Total Contributions', 'Total Distributions', 'Investor Total Commitments'], {
    edgeCase: 'Floored at zero; divides by paid-in contributions when commitments are zero or unavailable. Not currently rendered on the chart.',
  }),
  metric('capitalAtWork', 'Capital At Work', 'Non-Recallable Distributions', 'Tooltip', 'SUM("Total Distributions") - SUM("Recallable Distributions")', ['Total Distributions', 'Recallable Distributions']),
  metric('kpis', 'KPIs', 'Total Commitment', 'KPI Tile', 'SUM("Investor Total Commitments")', ['Investor Total Commitments']),
  metric(
    'kpis',
    'KPIs',
    'Total Value',
    'KPI Tile',
    'NEG_SUM("Investments Value") + SUM("Actual Distributions") - SUM("Carry Paid") - SUM("Carry Realized") - SUM("Carry Unrealized") - SUM("Transfer of Interest")',
    ['Investments Value', 'Carry Paid', 'Actual Distributions', 'Carry Realized', 'Carry Unrealized', 'Transfer of Interest'],
    {
      behavior:
        'Sums the per-program Total Value across all programs; mirrors Total Value By Program (Investments Value source, Carry Paid retained, no longer reads the unused Actual Investment Activity field).',
    },
  ),
  metric('kpis', 'KPIs', 'Total Carried Interest', 'KPI Tile', 'NEG(SUM("Carry Unrealized") + SUM("Carry Realized") + SUM("Carry Transfer"))', ['Carry Unrealized', 'Carry Realized', 'Carry Transfer']),
  metric('ltdCommitmentSummary', 'LTD Commitment Summary', 'Unfunded', 'Bar / Ring', 'SUM("Investor Available Unfunded Commitments")', ['Investor Available Unfunded Commitments']),
  metric(
    'ltdCommitmentSummary',
    'LTD Commitment Summary',
    'Deemed',
    'Bar / Ring',
    'SUM("Investor Total Commitments") - SUM("Investor Available Unfunded Commitments") + SUM("Contributions that affect remaining commitment") + SUM("Recallable Distributions")',
    ['Investor Total Commitments', 'Investor Available Unfunded Commitments', 'Contributions that affect remaining commitment', 'Recallable Distributions'],
  ),
  metric(
    'ltdCommitmentSummary',
    'LTD Commitment Summary',
    'Cash',
    'Bar / Ring',
    'NEG(SUM("Contributions that affect remaining commitment") + SUM("Recallable Distributions"))',
    ['Contributions that affect remaining commitment', 'Recallable Distributions'],
  ),
  metric('ltdCommitmentSummary', 'LTD Commitment Summary', 'Life to Date Commitment', 'Bar Total / Ring', 'SUM("Investor Total Commitments")', ['Investor Total Commitments']),
  metric('totalValueByProgram', 'Total Value By Program', 'Investment Value', 'Bar / Ring', 'NEG_SUM("Investments Value")', ['Investments Value'], {
    edgeCase: 'Sourced from the Investments Value field (stored negative; negated to a positive current value). The Actual Investment Activity column is mapped and stored but read by no chart.',
  }),
  metric('totalValueByProgram', 'Total Value By Program', 'Carried Interest Distributed', 'Bar / Ring', 'SUM("Carry Paid")', ['Carry Paid']),
  metric('totalValueByProgram', 'Total Value By Program', 'Carried Interest Balance', 'Bar / Ring', 'NEG(SUM("Carry Realized") + SUM("Carry Unrealized") + SUM("Carry Paid"))', ['Carry Realized', 'Carry Unrealized', 'Carry Paid']),
  metric('totalValueByProgram', 'Total Value By Program', 'Investment Distributed', 'Bar / Ring', 'SUM("Actual Distributions") - SUM("Carry Paid")', ['Actual Distributions', 'Carry Paid']),
  metric('totalValueByProgram', 'Total Value By Program', 'Transfer of Interest', 'Bar / Ring', 'NEG_SUM("Transfer of Interest")', ['Transfer of Interest']),
  metric(
    'totalValueByProgram',
    'Total Value By Program',
    'Total Value',
    'Bar Total / Ring',
    'METRIC("Investment Value") + METRIC("Carried Interest Distributed") + METRIC("Carried Interest Balance") + METRIC("Investment Distributed") + METRIC("Transfer of Interest")',
    ['Investments Value', 'Carry Realized', 'Carry Unrealized', 'Carry Paid', 'Actual Distributions', 'Transfer of Interest'],
    {
      edgeCase:
        'Sum of the five rendered components, so the bar total equals the visible stack. Carry Paid does not cancel: Carried Interest Distributed adds it once while Carried Interest Balance and Investment Distributed each subtract it.',
    },
  ),
  metric('carriedInterestByProgram', 'Carried Interest By Program', 'Realized - Distributed', 'Bar / Ring', 'SUM("Carry Paid")', ['Carry Paid']),
  metric('carriedInterestByProgram', 'Carried Interest By Program', 'Realized - Undistributed', 'Bar / Ring', 'NEG(SUM("Carry Realized") + SUM("Carry Paid"))', ['Carry Realized', 'Carry Paid']),
  metric('carriedInterestByProgram', 'Carried Interest By Program', 'Unrealized Gain', 'Bar / Ring', 'NEG_SUM("Carry Unrealized")', ['Carry Unrealized']),
  metric('carriedInterestByProgram', 'Carried Interest By Program', 'Carry Transfer', 'Bar / Ring', 'NEG_SUM("Carry Transfer")', ['Carry Transfer']),
  metric('carriedInterestByProgram', 'Carried Interest By Program', 'Total Carried Interest', 'Bar Total / Ring', 'NEG(SUM("Carry Unrealized") + SUM("Carry Realized") + SUM("Carry Transfer"))', ['Carry Unrealized', 'Carry Realized', 'Carry Transfer']),
  metric('cashFlowByPeriod', 'Cash Flow By Period', 'Contributions', 'Negative Bar', 'IF(SUM("ITD Contributions") > 0, NEG_SUM("ITD Contributions"), SUM("ITD Contributions"))', ['ITD Contributions'], {
    behavior: 'Yearly; positive ITD contribution totals are flipped below the axis.',
  }),
  metric('cashFlowByPeriod', 'Cash Flow By Period', 'Distributions', 'Positive Bar', 'SUM("Actual Distributions")', ['Actual Distributions']),
  metric('cashFlowByPeriod', 'Cash Flow By Period', 'Net Cash', 'Line', 'METRIC("Distributions") + METRIC("Contributions")', ['Actual Distributions', 'ITD Contributions']),
];

export const DEFAULT_FORMULA_REGISTRY: FormulaRegistry = Object.fromEntries(
  metrics.map((item) => [item.id, item]),
);

export const VISUAL_NAMES = Array.from(
  new Map(metrics.map((item) => [item.visualId, item.visualName])).entries(),
).map(([id, name]) => ({ id, name }));

export function cloneFormulaRegistry(): FormulaRegistry {
  return Object.fromEntries(
    Object.entries(DEFAULT_FORMULA_REGISTRY).map(([key, value]) => [key, { ...value }]),
  );
}
