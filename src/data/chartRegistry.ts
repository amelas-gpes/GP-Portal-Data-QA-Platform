// Central chart registry — the single source for chart ids, titles, the
// LP/GP family split, and the chart-id → visual-id (formula registry) mapping.
// Replaces the five hand-synced registries that previously lived in
// Charts.tsx, VisualWorkbench.tsx, and ConfigureCharts.tsx.

export type ChartSide = 'lp' | 'gp';

export type ChartDescriptor = {
  /** Chart card id (one card per entry). */
  chartId: string;
  /** Formula-registry visual id this chart's metrics belong to. */
  visualId: string;
  title: string;
  side: ChartSide;
};

export const CHART_REGISTRY: ChartDescriptor[] = [
  { chartId: 'commitmentSummary', visualId: 'commitmentSummary', title: 'Commitment Summary', side: 'lp' },
  { chartId: 'totalValue', visualId: 'totalValue', title: 'Total Value', side: 'lp' },
  { chartId: 'cashFlowSummary', visualId: 'cashFlowSummary', title: 'Cash Flow Summary', side: 'lp' },
  { chartId: 'ratioAnalysis', visualId: 'ratioAnalysis', title: 'Ratio Analysis', side: 'lp' },
  { chartId: 'capitalAtWork', visualId: 'capitalAtWork', title: 'Capital At Work', side: 'lp' },
  { chartId: 'ltdCommitmentSummaryBar', visualId: 'ltdCommitmentSummary', title: 'LTD Commitment Summary Bar', side: 'gp' },
  { chartId: 'ltdCommitmentSummaryPie', visualId: 'ltdCommitmentSummary', title: 'LTD Commitment Summary Pie', side: 'gp' },
  { chartId: 'totalValueByProgramBar', visualId: 'totalValueByProgram', title: 'Total Value By Program Bar', side: 'gp' },
  { chartId: 'totalValueByProgramPie', visualId: 'totalValueByProgram', title: 'Total Value By Program Pie', side: 'gp' },
  { chartId: 'carriedInterestByProgramBar', visualId: 'carriedInterestByProgram', title: 'Carried Interest By Program Bar', side: 'gp' },
  { chartId: 'carriedInterestByProgramPie', visualId: 'carriedInterestByProgram', title: 'Carried Interest By Program Pie', side: 'gp' },
  { chartId: 'cashFlowByPeriod', visualId: 'cashFlowByPeriod', title: 'Cash Flow By Period', side: 'gp' },
];

export const LP_VISUAL_IDS = ['commitmentSummary', 'totalValue', 'cashFlowSummary', 'ratioAnalysis', 'capitalAtWork'];
export const GP_VISUAL_IDS = ['ltdCommitmentSummary', 'totalValueByProgram', 'carriedInterestByProgram', 'cashFlowByPeriod', 'kpis'];

const byChartId = new Map(CHART_REGISTRY.map((entry) => [entry.chartId, entry]));

export function chartTitle(chartId: string): string {
  return byChartId.get(chartId)?.title ?? chartId;
}

export function visualIdForChart(chartId: string): string {
  return byChartId.get(chartId)?.visualId ?? chartId;
}

export function chartIdsForSide(side: ChartSide): string[] {
  return CHART_REGISTRY.filter((entry) => entry.side === side).map((entry) => entry.chartId);
}

export function visualIdsForSide(side: ChartSide): string[] {
  return side === 'gp' ? GP_VISUAL_IDS : LP_VISUAL_IDS;
}
