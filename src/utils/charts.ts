import type {
  BIRow,
  ChartBundle,
  ChartBundleSet,
  DashboardFilters,
  FormulaRegistry,
  InvestorOption,
  KpiSummary,
  LogicVersion,
  PieModel,
  ProgramPoint,
  QuarterPoint,
  ReconciliationRow,
  ReconciliationSummary,
  TooltipMetricContext,
  TooltipMetricContextMap,
  YearPoint,
} from '../types';
import { MONEY_EPSILON, filterRows, groupByProgram, groupByQuarter, groupByYear, safeDivide } from './aggregation';
import { toISODate } from './format';
import { evaluateMetric, validateFormula } from './formula';

// Raw rows crossing the worker boundary are capped to keep structured-clone
// transfers responsive. Consumers must compare rawRows.length against
// bundle.rowCount and tell the user when they are looking at a sample.
export const RAW_ROW_SAMPLE_LIMIT = 5_000;

const quarterTooltipMetrics: Record<keyof Omit<QuarterPoint, 'key' | 'label' | 'endDate' | 'rowCount' | 'percentDeployed' | 'tooltipMetrics'>, string> = {
  contributions: 'cashFlowSummary.Contributions',
  distributions: 'cashFlowSummary.Distributions',
  commitments: 'commitmentSummary.Commitments',
  unfundedCommitments: 'commitmentSummary.Unfunded Commitments',
  capitalAccountBalance: 'totalValue.Capital Account Balance',
  totalValue: 'totalValue.Total Value',
  tvpi: 'ratioAnalysis.TVPI',
  dpi: 'ratioAnalysis.DPI',
  capitalAtWork: 'capitalAtWork.Capital At Work',
  nonRecallableDistributions: 'capitalAtWork.Non-Recallable Distributions',
};

const programTooltipMetrics: Record<keyof Omit<ProgramPoint, 'programKey' | 'programName' | 'companyGroupCode' | 'rowCount' | 'tooltipMetrics'>, string> = {
  ltdUnfunded: 'ltdCommitmentSummary.Unfunded',
  ltdDeemed: 'ltdCommitmentSummary.Deemed',
  ltdCash: 'ltdCommitmentSummary.Cash',
  ltdCommitment: 'ltdCommitmentSummary.Life to Date Commitment',
  investmentValue: 'totalValueByProgram.Investment Value',
  carriedInterestDistributed: 'totalValueByProgram.Carried Interest Distributed',
  carriedInterestBalance: 'totalValueByProgram.Carried Interest Balance',
  investmentDistributed: 'totalValueByProgram.Investment Distributed',
  transferOfInterest: 'totalValueByProgram.Transfer of Interest',
  totalValue: 'totalValueByProgram.Total Value',
  carryRealizedDistributed: 'carriedInterestByProgram.Realized - Distributed',
  carryRealizedUndistributed: 'carriedInterestByProgram.Realized - Undistributed',
  carryUnrealizedGain: 'carriedInterestByProgram.Unrealized Gain',
  carryTransfer: 'carriedInterestByProgram.Carry Transfer',
  totalCarriedInterest: 'carriedInterestByProgram.Total Carried Interest',
};

const yearTooltipMetrics: Record<keyof Omit<YearPoint, 'year' | 'label' | 'rowCount' | 'tooltipMetrics'>, string> = {
  contributions: 'cashFlowByPeriod.Contributions',
  distributions: 'cashFlowByPeriod.Distributions',
  netCash: 'cashFlowByPeriod.Net Cash',
};

export function buildInvestorOptions(rows: BIRow[]): InvestorOption[] {
  const map = new Map<string, { option: InvestorOption; count: number }>();
  for (const row of rows) {
    const existing = map.get(row.investorKey);
    if (existing) {
      existing.count += 1;
      existing.option.rowCount = existing.count;
      continue;
    }
    map.set(row.investorKey, {
      count: 1,
      option: {
        key: row.investorKey,
        label: `${row.investorPortalDisplayName ?? row.investorGroupName ?? 'Unnamed investor'} - ${row.companyName ?? 'No company'} - ${row.investorNo ?? 'No investor no'}`,
        investorPortalDisplayName: row.investorPortalDisplayName,
        investorGroupName: row.investorGroupName,
        investorNo: row.investorNo,
        investorShortCode: row.investorShortCode,
        companyName: row.companyName,
        companyGroupCode: row.companyGroupCode,
        fundCurrencyCode: row.fundCurrencyCode,
        investorType: row.investorType,
        rowCount: 1,
      },
    });
  }
  return Array.from(map.values())
    .map((value) => value.option)
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function buildChartBundle(
  allRows: BIRow[],
  rowsByInvestor: Map<string, BIRow[]>,
  investorOptions: InvestorOption[],
  investorKeys: string[],
  filters: DashboardFilters,
  formulas: FormulaRegistry,
  logicVersion: LogicVersion,
  options: { includeRawRows?: boolean } = {},
): ChartBundle {
  const uniqueInvestorKeys = Array.from(new Set(investorKeys.filter(Boolean)));
  const baseRows = selectRowsForGrouping(allRows, rowsByInvestor, investorOptions, uniqueInvestorKeys, filters.groupingMode);
  const rows = filterRows(baseRows, filters);
  const selectedInvestors = uniqueInvestorKeys
    .map((key) => investorOptions.find((option) => option.key === key))
    .filter((option): option is InvestorOption => Boolean(option));
  const selectedInvestor = selectedInvestors.length === 1 ? selectedInvestors[0] : null;
  const investorKey = selectedInvestor?.key ?? null;
  const quarterSeries = computeQuarterSeries(rows, formulas, logicVersion, filters.cumulative);
  const programSeries = computeProgramSeries(rows, formulas, logicVersion);
  const yearSeries = computeYearSeries(rows, formulas, logicVersion);
  const kpis = computeKpis(rows, formulas, logicVersion);
  return {
    investorKey,
    selectedInvestor,
    investorKeys: uniqueInvestorKeys,
    selectedInvestors,
    rowCount: rows.length,
    quarterSeries,
    programSeries,
    yearSeries,
    kpis,
    pies: {
      ltdCommitment: buildPieModel(programSeries, [
        ['Cash Commitment', 'ltdCash', 'ltdCommitmentSummary.Cash'],
        ['Deemed Commitment', 'ltdDeemed', 'ltdCommitmentSummary.Deemed'],
        ['Unfunded Commitment', 'ltdUnfunded', 'ltdCommitmentSummary.Unfunded'],
      ]),
      totalValue: buildPieModel(programSeries, [
        ['Investment Value', 'investmentValue', 'totalValueByProgram.Investment Value'],
        ['Investment Distributed', 'investmentDistributed', 'totalValueByProgram.Investment Distributed'],
        ['Carried Interest Distributed', 'carriedInterestDistributed', 'totalValueByProgram.Carried Interest Distributed'],
        ['Carried Interest Balance', 'carriedInterestBalance', 'totalValueByProgram.Carried Interest Balance'],
        ['Transfer of Interest', 'transferOfInterest', 'totalValueByProgram.Transfer of Interest'],
      ]),
      carriedInterest: buildPieModel(programSeries, [
        ['Realized - Distributed', 'carryRealizedDistributed', 'carriedInterestByProgram.Realized - Distributed'],
        ['Realized - Undistributed', 'carryRealizedUndistributed', 'carriedInterestByProgram.Realized - Undistributed'],
        ['Unrealized Gain', 'carryUnrealizedGain', 'carriedInterestByProgram.Unrealized Gain'],
        ['Carry Transfer', 'carryTransfer', 'carriedInterestByProgram.Carry Transfer'],
      ]),
    },
    // rawRows dominate the structured-clone cost of every bundle (up to 5,000
    // rows x ~130 values each); interactive stepping requests lite bundles and
    // refetches with rows only when the what-if simulation actually needs them.
    rawRows: (options.includeRawRows ?? true) ? rows.slice(0, RAW_ROW_SAMPLE_LIMIT) : [],
  };
}

export function buildChartBundleSet(
  allRows: BIRow[],
  rowsByInvestor: Map<string, BIRow[]>,
  investorOptions: InvestorOption[],
  investorKeys: string[],
  filters: DashboardFilters,
  formulas: FormulaRegistry,
  logicVersion: LogicVersion,
  options: { includeIndividualBundles?: boolean; includeRawRows?: boolean } = {},
): ChartBundleSet {
  const uniqueInvestorKeys = Array.from(new Set(investorKeys.filter(Boolean)));
  const includeIndividualBundles = options.includeIndividualBundles ?? true;
  const includeRawRows = options.includeRawRows ?? true;
  return {
    combined: buildChartBundle(
      allRows,
      rowsByInvestor,
      investorOptions,
      uniqueInvestorKeys,
      filters,
      formulas,
      logicVersion,
      { includeRawRows },
    ),
    individual: includeIndividualBundles
      ? uniqueInvestorKeys.map((investorKey) => buildChartBundle(
        allRows,
        rowsByInvestor,
        investorOptions,
        [investorKey],
        filters,
        formulas,
        logicVersion,
        { includeRawRows },
      ))
      : [],
  };
}

function selectRowsForGrouping(
  allRows: BIRow[],
  rowsByInvestor: Map<string, BIRow[]>,
  investorOptions: InvestorOption[],
  investorKeys: string[],
  groupingMode: DashboardFilters['groupingMode'],
): BIRow[] {
  if (!investorKeys.length) return allRows;
  if (groupingMode === 'investorFundPairing') {
    return investorKeys.flatMap((key) => rowsByInvestor.get(key) ?? []);
  }

  const selectedOptions = investorKeys
    .map((key) => investorOptions.find((option) => option.key === key))
    .filter((option): option is InvestorOption => Boolean(option));

  if (groupingMode === 'groupCode') {
    const selectedGroupCodes = new Set(selectedOptions.map((option) => option.companyGroupCode).filter((value): value is string => Boolean(value)));
    if (!selectedGroupCodes.size) return investorKeys.flatMap((key) => rowsByInvestor.get(key) ?? []);
    return allRows.filter((row) => row.companyGroupCode && selectedGroupCodes.has(row.companyGroupCode));
  }

  const selectedInvestorIds = new Set(
    selectedOptions
      .flatMap((option) => [option.investorNo, option.investorShortCode])
      .filter((value): value is string => Boolean(value)),
  );
  if (!selectedInvestorIds.size) return investorKeys.flatMap((key) => rowsByInvestor.get(key) ?? []);
  return allRows.filter((row) => {
    if (row.investorNo && selectedInvestorIds.has(row.investorNo)) return true;
    if (row.investorShortCode && selectedInvestorIds.has(row.investorShortCode)) return true;
    return false;
  });
}

export function computeQuarterSeries(rows: BIRow[], formulas: FormulaRegistry, version: LogicVersion, cumulative: boolean): QuarterPoint[] {
  const sortedRows = [...rows].sort((a, b) => (a.postingDate?.getTime() ?? 0) - (b.postingDate?.getTime() ?? 0));
  // Quarter buckets arrive in chronological order ('No Date' first), so one
  // growing array replaces the previous O(rows) re-filter per bucket. Each
  // bucket finishes evaluating before the next push, so handing the live array
  // to evaluateMetric is safe.
  const datedRowsThroughBucket: BIRow[] = [];
  return groupByQuarter(sortedRows).map((bucket) => {
    let cumulativeRows = bucket.rows;
    if (bucket.endDate) {
      for (const row of bucket.rows) {
        if (row.postingDate) datedRowsThroughBucket.push(row);
      }
      cumulativeRows = datedRowsThroughBucket;
    }
    const bucketRows = cumulative && bucket.endDate ? datedRowsThroughBucket : bucket.rows;
    const commitments = evaluateMetric(formulas, 'commitmentSummary', 'Commitments', bucketRows, version, [], cumulativeRows);
    const capitalAtWork = evaluateMetric(formulas, 'capitalAtWork', 'Capital At Work', bucketRows, version, [], cumulativeRows);
    return {
      key: bucket.key,
      label: bucket.label,
      endDate: toISODate(bucket.endDate),
      rowCount: bucketRows.length,
      contributions: evaluateMetric(formulas, 'cashFlowSummary', 'Contributions', bucketRows, version, [], cumulativeRows),
      distributions: evaluateMetric(formulas, 'cashFlowSummary', 'Distributions', bucketRows, version, [], cumulativeRows),
      commitments,
      unfundedCommitments: evaluateMetric(formulas, 'commitmentSummary', 'Unfunded Commitments', bucketRows, version, [], cumulativeRows),
      capitalAccountBalance: evaluateMetric(formulas, 'totalValue', 'Capital Account Balance', bucketRows, version, [], cumulativeRows),
      totalValue: evaluateMetric(formulas, 'totalValue', 'Total Value', bucketRows, version, [], cumulativeRows),
      tvpi: evaluateMetric(formulas, 'ratioAnalysis', 'TVPI', bucketRows, version, [], cumulativeRows),
      dpi: evaluateMetric(formulas, 'ratioAnalysis', 'DPI', bucketRows, version, [], cumulativeRows),
      capitalAtWork,
      percentDeployed: safeDivide(capitalAtWork, commitments, 0),
      nonRecallableDistributions: evaluateMetric(formulas, 'capitalAtWork', 'Non-Recallable Distributions', bucketRows, version, [], cumulativeRows),
      tooltipMetrics: buildTooltipMetrics(bucketRows, formulas, quarterTooltipMetrics, cumulativeRows),
    };
  });
}

export function computeProgramSeries(rows: BIRow[], formulas: FormulaRegistry, version: LogicVersion): ProgramPoint[] {
  return groupByProgram(rows).map((bucket) => ({
    programKey: bucket.key,
    programName: bucket.rows[0]?.companyName ?? bucket.label,
    companyGroupCode: bucket.rows[0]?.companyGroupCode ?? null,
    rowCount: bucket.rows.length,
    ltdUnfunded: evaluateMetric(formulas, 'ltdCommitmentSummary', 'Unfunded', bucket.rows, version),
    ltdDeemed: evaluateMetric(formulas, 'ltdCommitmentSummary', 'Deemed', bucket.rows, version),
    ltdCash: evaluateMetric(formulas, 'ltdCommitmentSummary', 'Cash', bucket.rows, version),
    ltdCommitment: evaluateMetric(formulas, 'ltdCommitmentSummary', 'Life to Date Commitment', bucket.rows, version),
    investmentValue: evaluateMetric(formulas, 'totalValueByProgram', 'Investment Value', bucket.rows, version),
    carriedInterestDistributed: evaluateMetric(formulas, 'totalValueByProgram', 'Carried Interest Distributed', bucket.rows, version),
    carriedInterestBalance: evaluateMetric(formulas, 'totalValueByProgram', 'Carried Interest Balance', bucket.rows, version),
    investmentDistributed: evaluateMetric(formulas, 'totalValueByProgram', 'Investment Distributed', bucket.rows, version),
    transferOfInterest: evaluateMetric(formulas, 'totalValueByProgram', 'Transfer of Interest', bucket.rows, version),
    totalValue: evaluateMetric(formulas, 'totalValueByProgram', 'Total Value', bucket.rows, version),
    carryRealizedDistributed: evaluateMetric(formulas, 'carriedInterestByProgram', 'Realized - Distributed', bucket.rows, version),
    carryRealizedUndistributed: evaluateMetric(formulas, 'carriedInterestByProgram', 'Realized - Undistributed', bucket.rows, version),
    carryUnrealizedGain: evaluateMetric(formulas, 'carriedInterestByProgram', 'Unrealized Gain', bucket.rows, version),
    carryTransfer: evaluateMetric(formulas, 'carriedInterestByProgram', 'Carry Transfer', bucket.rows, version),
    totalCarriedInterest: evaluateMetric(formulas, 'carriedInterestByProgram', 'Total Carried Interest', bucket.rows, version),
    tooltipMetrics: buildTooltipMetrics(bucket.rows, formulas, programTooltipMetrics),
  }));
}

export function computeYearSeries(rows: BIRow[], formulas: FormulaRegistry, version: LogicVersion): YearPoint[] {
  // Year buckets are chronological ('No Date' first); same growing-prefix
  // pattern as computeQuarterSeries for the CUMULATIVE() scope.
  const datedRowsThroughBucket: BIRow[] = [];
  return groupByYear(rows).map((bucket) => {
    let cumulativeRows = bucket.rows;
    if (bucket.key !== 0) {
      for (const row of bucket.rows) {
        if (row.postingDate) datedRowsThroughBucket.push(row);
      }
      cumulativeRows = datedRowsThroughBucket;
    }
    return {
      year: bucket.key,
      label: bucket.label,
      rowCount: bucket.rows.length,
      contributions: evaluateMetric(formulas, 'cashFlowByPeriod', 'Contributions', bucket.rows, version, [], cumulativeRows),
      distributions: evaluateMetric(formulas, 'cashFlowByPeriod', 'Distributions', bucket.rows, version, [], cumulativeRows),
      netCash: evaluateMetric(formulas, 'cashFlowByPeriod', 'Net Cash', bucket.rows, version, [], cumulativeRows),
      tooltipMetrics: buildTooltipMetrics(bucket.rows, formulas, yearTooltipMetrics, cumulativeRows),
    };
  });
}

export function computeKpis(rows: BIRow[], formulas: FormulaRegistry, version: LogicVersion): KpiSummary {
  return {
    totalCommitment: evaluateMetric(formulas, 'kpis', 'Total Commitment', rows, version),
    // Evaluated from the registry like the other tiles so a draft edit to
    // kpis.Total Value is honored instead of silently bypassed.
    totalValue: evaluateMetric(formulas, 'kpis', 'Total Value', rows, version),
    totalCarriedInterest: evaluateMetric(formulas, 'kpis', 'Total Carried Interest', rows, version),
  };
}

export function buildPieModel(
  programSeries: ProgramPoint[],
  fields: Array<[name: string, key: keyof ProgramPoint, metricKey: string]>,
): PieModel {
  const values = programSeries.flatMap((program) =>
    fields.map(([name, key, metricKey]) => ({
      name,
      program: program.programName,
      signedValue: Number(program[key] ?? 0),
      metricKey,
      rowCount: program.rowCount,
      tooltipMetric: program.tooltipMetrics[String(key)] ?? buildEmptyTooltipMetricContext(program.rowCount),
    })),
  );
  // Residue tolerance: a segment of -1e-12 from offsetting rows is zero, not a
  // negative value that should suppress the whole pie.
  const negative = values.find((value) => value.signedValue < -MONEY_EPSILON);
  if (negative) {
    return {
      suppressed: true,
      reason: 'Pie suppressed because one or more segments are negative. Use the bar chart for sign-aware review.',
      inner: [],
      outer: [],
    };
  }
  const inner = fields
    .map(([name, , metricKey]) => {
      const matchingValues = values.filter((value) => value.name === name);
      const tooltipMetric = mergeTooltipMetricContexts(matchingValues.map((value) => value.tooltipMetric));
      return {
        name,
        signedValue: matchingValues.reduce((sum, value) => sum + value.signedValue, 0),
        value: matchingValues.reduce((sum, value) => sum + Math.abs(value.signedValue), 0),
        tooltipMetricKey: metricKey,
        rowCount: tooltipMetric.rowCount,
        tooltipMetrics: { [metricKey]: tooltipMetric },
      };
    })
    .filter((value) => value.value > MONEY_EPSILON);
  const outer = values
    .filter((value) => Math.abs(value.signedValue) > MONEY_EPSILON)
    .map((value) => ({
      name: value.program,
      category: value.name,
      signedValue: value.signedValue,
      value: Math.abs(value.signedValue),
      tooltipMetricKey: value.metricKey,
      rowCount: value.rowCount,
      tooltipMetrics: { [value.metricKey]: value.tooltipMetric },
    }));
  return { suppressed: false, reason: null, inner, outer };
}

function buildTooltipMetrics(
  rows: BIRow[],
  formulas: FormulaRegistry,
  metricKeys: Record<string, string>,
  cumulativeRows: BIRow[] = rows,
): TooltipMetricContextMap {
  // When no draft anywhere differs from production every draft value is equal
  // by construction (METRIC references resolve through the same registry), so
  // the second full-row evaluation per metric can be skipped.
  const draftsChanged = Object.values(formulas).some((metric) => metric.productionFormula !== metric.draftFormula);
  return Object.fromEntries(
    Object.entries(metricKeys)
      .map(([dataKey, formulaKey]) => {
        const metric = formulas[formulaKey];
        if (!metric) return null;
        const productionValue = evaluateMetric(formulas, metric.visualId, metric.metricName, rows, 'production', [], cumulativeRows);
        const draftValue = draftsChanged
          ? evaluateMetric(formulas, metric.visualId, metric.metricName, rows, 'draft', [], cumulativeRows)
          : productionValue;
        return [
          dataKey,
          {
            productionValue,
            draftValue,
            delta: draftValue - productionValue,
            rowCount: rows.length,
          } satisfies TooltipMetricContext,
        ] as const;
      })
      .filter((entry): entry is readonly [string, TooltipMetricContext] => Boolean(entry)),
  );
}

function buildEmptyTooltipMetricContext(rowCount: number): TooltipMetricContext {
  return {
    productionValue: 0,
    draftValue: 0,
    delta: 0,
    rowCount,
  };
}

function mergeTooltipMetricContexts(contexts: TooltipMetricContext[]): TooltipMetricContext {
  return contexts.reduce<TooltipMetricContext>(
    (merged, context) => ({
      productionValue: merged.productionValue + context.productionValue,
      draftValue: merged.draftValue + context.draftValue,
      delta: merged.delta + context.delta,
      rowCount: merged.rowCount + context.rowCount,
    }),
    buildEmptyTooltipMetricContext(0),
  );
}

export function compareProductionDraft(
  rowsByInvestor: Map<string, BIRow[]>,
  investorOptions: InvestorOption[],
  filters: DashboardFilters,
  formulas: FormulaRegistry,
): ReconciliationSummary {
  const changedMetricStates = Object.values(formulas)
    .filter((metric) => metric.productionFormula !== metric.draftFormula)
    .map((metric) => ({
      metric,
      validation: validateFormula(metric.draftFormula, formulas, metric.visualId, metric.id),
    }));
  const changedMetrics = changedMetricStates.map((state) => state.metric);
  const validChangedMetrics = changedMetricStates
    .filter((state) => state.validation.ok)
    .map((state) => state.metric);
  const invalidFormulas = changedMetricStates
    .filter((state) => !state.validation.ok)
    .map((state) => `${state.metric.visualName}: ${state.metric.metricName} - ${state.validation.errors.join('; ')}`);
  const rows: ReconciliationRow[] = [];
  for (const investor of investorOptions) {
    const investorRows = filterRows(rowsByInvestor.get(investor.key) ?? [], filters);
    if (investorRows.length === 0) continue;
    for (const metric of validChangedMetrics) {
      const productionValue = evaluateMetric(formulas, metric.visualId, metric.metricName, investorRows, 'production');
      const draftValue = evaluateMetric(formulas, metric.visualId, metric.metricName, investorRows, 'draft');
      const absoluteDelta = draftValue - productionValue;
      // Half-cent threshold: a real one-cent delta computes as 0.00999... after
      // float subtraction, so a `< 0.01` check silently dropped genuine deltas
      // on ROUND(...,2) metrics where one cent is the smallest possible change.
      if (Math.abs(absoluteDelta) < MONEY_EPSILON) continue;
      rows.push({
        investorKey: investor.key,
        investor: investor.investorPortalDisplayName ?? investor.investorGroupName ?? 'Unnamed investor',
        company: investor.companyName ?? 'No company',
        metric: `${metric.visualName}: ${metric.metricName}`,
        productionValue,
        draftValue,
        absoluteDelta,
        percentDelta: Math.abs(productionValue) < MONEY_EPSILON ? null : absoluteDelta / Math.abs(productionValue),
        scenarioFlags: [],
      });
    }
  }
  const topAbsolute = [...rows].sort((a, b) => Math.abs(b.absoluteDelta) - Math.abs(a.absoluteDelta)).slice(0, 50);
  const topPercent = [...rows]
    .filter((row) => row.percentDelta !== null)
    .sort((a, b) => Math.abs(b.percentDelta ?? 0) - Math.abs(a.percentDelta ?? 0))
    .slice(0, 50);
  return {
    affectedInvestorCount: new Set(rows.map((row) => row.investorKey)).size,
    topAbsolute,
    topPercent,
    metricsChanged: changedMetrics.map((metric) => `${metric.visualName}: ${metric.metricName}`),
    chartsChanged: Array.from(new Set(changedMetrics.map((metric) => metric.visualName))),
    invalidFormulas,
  };
}
