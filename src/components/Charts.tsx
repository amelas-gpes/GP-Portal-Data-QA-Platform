import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  type PieLabelRenderProps,
} from 'recharts';
import { chartTitle, visualIdForChart } from '../data/chartRegistry';
import type { ChartBundle, FormulaMetric, FormulaRegistry, LogicVersion } from '../types';
import { pieModelToTsv, seriesToTsv, type TsvColumn } from '../utils/chartExport';
import { chartColors as colors, piePalette } from '../utils/chartTheme';
import { formatCurrency, formatRatio } from '../utils/format';
import { ChartCard, type ChartCardBadge, type ChartMetricChip } from './ChartCard';
import { EmptyState } from './common';
import { ExpandedChartTable } from './stage/ExpandedChartTable';
import { SyncedPeriodHighlight } from './stage/PeriodHoverContext';
import { FinancialTooltip } from './Tooltips';

export type DiffLens = 'compare' | 'baseline' | 'changed';

export type ChartFamilyDiffProps = {
  /** Render before/after treatment (ghost baselines + delta badges). */
  comparison?: boolean;
  /** Ghost hue: terracotta dashed = formula draft, amber dashed = simulation. */
  ghostTone?: 'draft' | 'sim';
  /** Compare = solid active + ghost baseline; Baseline = production values only; Changed = dim unchanged cards. */
  lens?: DiffLens;
  /** Data already carries `${key}__base` baseline fields (simulation path). */
  precomputedBaseline?: boolean;
};

export type ChartFamilyInteractionProps = {
  /** Open the change-data (what-if) drawer scoped to this metric. */
  onMetricClick?: (metricId: string) => void;
};

const currencyAxis = (value: number) => formatCurrency(value);
const ratioAxis = (value: number) => formatRatio(value);
const gridStroke = '#EEE9DE';
const axisStroke = '#A19C94';
const surfaceStroke = '#ffffff';
const leaderStroke = '#D8D1C4';
const tooltipEscapeViewBox = { x: false, y: true };
const tooltipWrapperStyle = { zIndex: 90, pointerEvents: 'auto' } as const;
const LP_TRANSFER_ACTIVITY_FOOTER = 'Visuals include transferred-in partner activity where applicable.';

export type Visibility = Record<string, boolean>;

const programMetricLookup: Partial<Record<keyof ChartBundle['programSeries'][number], string>> = {
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

type SkeletonVariant = 'combo' | 'stacked' | 'area' | 'line' | 'horizontal' | 'donut' | 'cashFlow';
type ExpandedChartControls = {
  expandedChartId?: string | null;
  onExpandedChartChange?: (chartId: string | null) => void;
};
type ChartCardContextOptions = {
  bundle: ChartBundle | null;
  hasData: boolean;
  contextIds?: string[];
  comparisonBadge?: ChartCardBadge | null;
  formulas?: FormulaRegistry;
  onMetricClick?: (metricId: string) => void;
  dimmed?: boolean;
};

function FormulaTooltip({
  formulas,
  logicVersion,
  metricLookup,
  contextLabel,
}: {
  formulas: FormulaRegistry;
  logicVersion: LogicVersion;
  metricLookup: Record<string, string>;
  contextLabel?: string;
}) {
  return (
    <Tooltip
      allowEscapeViewBox={tooltipEscapeViewBox}
      wrapperStyle={tooltipWrapperStyle}
      content={<FinancialTooltip formulas={formulas} logicVersion={logicVersion} metricLookup={metricLookup} contextLabel={contextLabel} />}
    />
  );
}

function getActiveExpandedChartId(expandedChartId: string | null | undefined, visibleChartIds: string[]) {
  return expandedChartId && visibleChartIds.includes(expandedChartId) ? expandedChartId : null;
}

function chartGridClass(activeExpandedChartId: string | null) {
  return `chart-grid ${activeExpandedChartId ? 'chart-grid-expanded' : ''}`;
}

function chartCardState(activeExpandedChartId: string | null, chartId: string, onExpandedChartChange?: (chartId: string | null) => void, options?: ChartCardContextOptions) {
  const baseBadges = options ? chartCardBadges(options.bundle, options.hasData) : [];
  const metricChips = options?.formulas && options.onMetricClick ? metricChipsForVisual(options.formulas, visualIdForChart(chartId)) : [];
  const isExpanded = activeExpandedChartId === chartId;
  return {
    expanded: isExpanded,
    concealed: Boolean(activeExpandedChartId) && !isExpanded,
    onExpandedChange: onExpandedChartChange,
    empty: options ? !options.hasData : false,
    badges: options?.comparisonBadge ? [options.comparisonBadge, ...baseBadges] : baseBadges,
    metricChips,
    onMetricClick: options?.onMetricClick,
    dimmed: options?.dimmed ?? false,
    // The rows behind this visual, shown below the chart only while expanded.
    detail: isExpanded && options
      ? <ExpandedChartTable bundle={options.bundle} chartId={chartId} title={chartTitle(chartId)} />
      : undefined,
  };
}

function metricChipsForVisual(formulas: FormulaRegistry, visualId: string): ChartMetricChip[] {
  return Object.values(formulas)
    .filter((metric: FormulaMetric) => metric.visualId === visualId)
    .map((metric) => ({
      id: metric.id,
      name: metric.metricName,
      dirty: metric.draftFormula !== metric.productionFormula,
    }));
}

// ── Before/after overlay helpers ───────────────────────────────────────────
// Each chart point already carries both production and draft values per metric
// in `tooltipMetrics`, so we can draw the "other version" as a ghost and compute
// per-chart deltas without recomputing anything.
const COMPARISON_EPSILON = 0.005;
const ghostStrokeByTone = { draft: '#c2543a', sim: '#b97d10' } as const;

type ComparablePoint = {
  tooltipMetrics?: Record<string, { productionValue: number; draftValue: number; delta: number } | undefined>;
};

function baselineValueFor(point: ComparablePoint, key: string, logicVersion: LogicVersion): number | undefined {
  const metric = point.tooltipMetrics?.[key];
  if (!metric) return undefined;
  return logicVersion === 'draft' ? metric.productionValue : metric.draftValue;
}

function seriesChanged(points: ComparablePoint[], keys: string[]): boolean {
  return points.some((point) => keys.some((key) => Math.abs(point.tooltipMetrics?.[key]?.delta ?? 0) > COMPARISON_EPSILON));
}

function withBaseline<T extends ComparablePoint>(points: T[], keys: string[], logicVersion: LogicVersion): T[] {
  return points.map((point) => {
    const next: Record<string, unknown> = { ...point };
    for (const key of keys) next[`${key}__base`] = baselineValueFor(point, key, logicVersion);
    return next as unknown as T;
  });
}

// Baseline lens: replace each comparable key's value with the other logic
// version's value (per-point context — no second bundle, no worker call).
function toBaseline<T extends ComparablePoint>(points: T[], keys: string[], logicVersion: LogicVersion): T[] {
  return points.map((point) => {
    const next: Record<string, unknown> = { ...point };
    for (const key of keys) {
      const baseline = baselineValueFor(point, key, logicVersion);
      if (baseline !== undefined) next[key] = baseline;
    }
    return next as unknown as T;
  });
}

function comparisonDeltaBadge(points: ComparablePoint[], keys: string[], format: (value: number) => string): ChartCardBadge | null {
  let bestKey = '';
  let bestDelta = 0;
  for (const key of keys) {
    const delta = points.reduce((sum, point) => sum + (point.tooltipMetrics?.[key]?.delta ?? 0), 0);
    if (Math.abs(delta) > Math.abs(bestDelta)) {
      bestDelta = delta;
      bestKey = key;
    }
  }
  if (Math.abs(bestDelta) < COMPARISON_EPSILON) {
    return { label: 'No change', tone: 'neutral', title: 'The applied draft does not change this visual for the current selection.' };
  }
  void bestKey;
  return {
    label: `Δ ${format(bestDelta)}`,
    tone: 'warn',
    title: `The applied draft moves this visual by ${format(bestDelta)} vs production, summed across the visible periods for the current selection. The faint dashed line shows production.`,
  };
}

// recharts ResponsiveContainer accepts a number or a percentage string.
type ContainerHeight = number | `${number}%`;

// The expanded chart fills its region fluidly ('100%') so the card's splitter
// can trade height between the chart and the inline data table below it; every
// other chart keeps its fixed default height.
function chartHeight(activeExpandedChartId: string | null, chartId: string, defaultHeight: number): ContainerHeight {
  return activeExpandedChartId === chartId ? '100%' : defaultHeight;
}

function chartCardBadges(bundle: ChartBundle | null, hasData: boolean): ChartCardBadge[] {
  if (!bundle) {
    return [{ label: 'Awaiting data', tone: 'neutral', title: 'Import data to populate this chart.' }];
  }

  const badges: ChartCardBadge[] = [];

  if (!hasData) {
    badges.push({
      label: 'No chart values',
      tone: 'neutral',
      title: 'The selected context is loaded, but this chart does not have values to plot.',
    });
  }

  return badges;
}

export function LPCharts({
  bundle,
  formulas,
  logicVersion,
  visibility,
  selectedVisualId,
  onVisualSelect,
  comparison = false,
  ghostTone = 'draft',
  lens = 'compare',
  precomputedBaseline = false,
  onMetricClick,
  expandedChartId,
  onExpandedChartChange,
}: {
  bundle: ChartBundle | null;
  formulas: FormulaRegistry;
  logicVersion: LogicVersion;
  visibility: Visibility;
  selectedVisualId?: string;
  onVisualSelect?: (visualId: string) => void;
} & ChartFamilyDiffProps & ChartFamilyInteractionProps & ExpandedChartControls) {
  const data = bundle?.quarterSeries ?? [];
  const hasData = data.length > 0;
  const cmp = comparison && hasData;
  const showGhosts = cmp && lens === 'compare';
  const ghostStroke = ghostStrokeByTone[ghostTone];
  const ghostLabel = ghostTone === 'sim' ? 'baseline' : 'production';
  // Draw the "other version" as a dashed ghost behind the solid series, so a
  // change reads as before/after on the chart itself. Baseline lens swaps the
  // solid series to the baseline values instead (no ghosts).
  const lensData = (keys: string[]) => {
    if (!cmp) return data;
    if (precomputedBaseline) return data; // `${key}__base` fields already merged in
    if (lens === 'baseline') return toBaseline(data, keys, logicVersion);
    return seriesChanged(data, keys) ? withBaseline(data, keys, logicVersion) : data;
  };
  const dimFor = (keys: string[]) => cmp && lens === 'changed' && !precomputedBaseline && !seriesChanged(data, keys);
  const badgeFor = (keys: string[], format: (value: number) => string) =>
    cmp && !precomputedBaseline ? comparisonDeltaBadge(data, keys, format) : null;
  const commitmentData = lensData(['commitments']);
  const cashFlowData = lensData(['contributions', 'distributions']);
  const ratioData = lensData(['tvpi', 'dpi']);
  const capitalAtWorkData = lensData(['capitalAtWork']);
  const commitmentBadge = badgeFor(['commitments', 'unfundedCommitments'], formatCurrency);
  const totalValueBadge = badgeFor(['totalValue', 'capitalAccountBalance', 'distributions'], formatCurrency);
  const cashFlowBadge = badgeFor(['contributions', 'distributions'], formatCurrency);
  const ratioBadge = badgeFor(['tvpi', 'dpi'], formatRatio);
  const capitalAtWorkBadge = badgeFor(['capitalAtWork', 'commitments'], formatCurrency);
  const cardContext = { formulas, onMetricClick };
  const ghost = (key: string, name: string, area = false) =>
    area ? (
      <Area dataKey={`${key}__base`} name={`${name} (${ghostLabel})`} stroke={ghostStroke} strokeDasharray="5 4" strokeWidth={1.5} fill="none" dot={false} legendType="none" isAnimationActive={false} connectNulls />
    ) : (
      <Line dataKey={`${key}__base`} name={`${name} (${ghostLabel})`} stroke={ghostStroke} strokeDasharray="5 4" strokeWidth={1.5} dot={false} legendType="none" isAnimationActive={false} connectNulls />
    );
  // Lazy copy-data builders over the series each chart actually renders
  // (lens-adjusted, including any merged `${key}__base` ghost columns).
  const exportSeries = (rows: ReadonlyArray<Record<string, unknown>>, columns: ReadonlyArray<TsvColumn>) =>
    () => seriesToTsv(rows, columns, { baselineLabel: ghostLabel });
  const visibleChartIds = [
    visibility.commitmentSummary ? 'commitmentSummary' : '',
    visibility.totalValue ? 'totalValue' : '',
    visibility.cashFlowSummary ? 'cashFlowSummary' : '',
    visibility.ratioAnalysis ? 'ratioAnalysis' : '',
    visibility.capitalAtWork ? 'capitalAtWork' : '',
  ].filter(Boolean);
  const activeExpandedChartId = getActiveExpandedChartId(expandedChartId, visibleChartIds);
  return (
    <div className={chartGridClass(activeExpandedChartId)}>
      {visibility.commitmentSummary ? (
        <ChartCard id="commitmentSummary" title="Commitment Summary" help="Bar shows unfunded commitments; line shows total commitments." selected={selectedVisualId === 'commitmentSummary'} onSelect={onVisualSelect ? () => onVisualSelect('commitmentSummary') : undefined} exportTsv={hasData ? exportSeries(commitmentData, [['label', 'Period'], ['unfundedCommitments', 'Unfunded Commitments'], ['commitments', 'Commitments']]) : undefined} {...chartCardState(activeExpandedChartId, 'commitmentSummary', onExpandedChartChange, { bundle, hasData, comparisonBadge: commitmentBadge, ...cardContext, dimmed: dimFor(['commitments', 'unfundedCommitments']) })}>
          {hasData ? (
            <ResponsiveContainer height={chartHeight(activeExpandedChartId, 'commitmentSummary', 270)}>
              <ComposedChart data={commitmentData}>
                <CartesianGrid stroke={gridStroke} vertical={false} />
                <SyncedPeriodHighlight />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={22} />
                <YAxis tickFormatter={currencyAxis} tick={{ fontSize: 11 }} />
                <FormulaTooltip formulas={formulas} logicVersion={logicVersion} metricLookup={{ unfundedCommitments: 'commitmentSummary.Unfunded Commitments', commitments: 'commitmentSummary.Commitments' }} />
                <Legend />
                <Bar isAnimationActive={false} dataKey="unfundedCommitments" name="Unfunded Commitments" fill={colors.lightBlue} />
                {showGhosts ? ghost('commitments', 'Commitments') : null}
                <Line isAnimationActive={false} dataKey="commitments" name="Commitments" stroke={colors.orange} strokeWidth={2} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <ChartSkeleton variant="combo" height={chartHeight(activeExpandedChartId, 'commitmentSummary', 270)} legendCount={2} />}
        </ChartCard>
      ) : null}
      {visibility.totalValue ? (
        <ChartCard id="totalValue" title="Total Value" help="Stacked bars show NAV and distributions; marker shows total value." selected={selectedVisualId === 'totalValue'} onSelect={onVisualSelect ? () => onVisualSelect('totalValue') : undefined} exportTsv={hasData ? exportSeries(data, [['label', 'Period'], ['capitalAccountBalance', 'Capital Account Balance'], ['distributions', 'Distributions'], ['totalValue', 'Total Value']]) : undefined} {...chartCardState(activeExpandedChartId, 'totalValue', onExpandedChartChange, { bundle, hasData, comparisonBadge: totalValueBadge, ...cardContext, dimmed: dimFor(['totalValue', 'capitalAccountBalance', 'distributions']) })}>
          {hasData ? (
            <ResponsiveContainer height={chartHeight(activeExpandedChartId, 'totalValue', 270)}>
              <ComposedChart data={data}>
                <CartesianGrid stroke={gridStroke} vertical={false} />
                <SyncedPeriodHighlight />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={22} />
                <YAxis tickFormatter={currencyAxis} tick={{ fontSize: 11 }} />
                <FormulaTooltip formulas={formulas} logicVersion={logicVersion} metricLookup={{ capitalAccountBalance: 'totalValue.Capital Account Balance', distributions: 'totalValue.Distributions', totalValue: 'totalValue.Total Value' }} />
                <Legend />
                <Bar isAnimationActive={false} dataKey="capitalAccountBalance" name="Capital Account Balance" stackId="value" fill={colors.blue} />
                <Bar isAnimationActive={false} dataKey="distributions" name="Distributions" stackId="value" fill={colors.green} />
                <Scatter isAnimationActive={false} dataKey="totalValue" name="Total Value" fill={colors.orange} line shape="circle" />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <ChartSkeleton variant="stacked" height={chartHeight(activeExpandedChartId, 'totalValue', 270)} legendCount={3} />}
        </ChartCard>
      ) : null}
      {visibility.cashFlowSummary ? (
        <ChartCard id="cashFlowSummary" title="Cash Flow Summary" help="Contributions and distributions over time, as economic-intent positive values." selected={selectedVisualId === 'cashFlowSummary'} onSelect={onVisualSelect ? () => onVisualSelect('cashFlowSummary') : undefined} exportTsv={hasData ? exportSeries(cashFlowData, [['label', 'Period'], ['contributions', 'Contributions'], ['distributions', 'Distributions']]) : undefined} {...chartCardState(activeExpandedChartId, 'cashFlowSummary', onExpandedChartChange, { bundle, hasData, comparisonBadge: cashFlowBadge, ...cardContext, dimmed: dimFor(['contributions', 'distributions']) })}>
          {hasData ? (
            <ResponsiveContainer height={chartHeight(activeExpandedChartId, 'cashFlowSummary', 270)}>
              <AreaChart data={cashFlowData}>
                <CartesianGrid stroke={gridStroke} vertical={false} />
                <SyncedPeriodHighlight />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={22} />
                <YAxis tickFormatter={currencyAxis} tick={{ fontSize: 11 }} />
                <FormulaTooltip formulas={formulas} logicVersion={logicVersion} metricLookup={{ contributions: 'cashFlowSummary.Contributions', distributions: 'cashFlowSummary.Distributions' }} />
                <Legend />
                {showGhosts ? ghost('contributions', 'Contributions', true) : null}
                {showGhosts ? ghost('distributions', 'Distributions', true) : null}
                <Area isAnimationActive={false} dataKey="contributions" name="Contributions" fill={colors.purple} stroke={colors.purple} fillOpacity={0.55} />
                <Area isAnimationActive={false} dataKey="distributions" name="Distributions" fill={colors.green} stroke={colors.green} fillOpacity={0.45} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <ChartSkeleton variant="area" height={chartHeight(activeExpandedChartId, 'cashFlowSummary', 270)} legendCount={2} />}
        </ChartCard>
      ) : null}
      {visibility.ratioAnalysis ? (
        <ChartCard id="ratioAnalysis" title="Ratio Analysis" help="TVPI and DPI over time with denominator guards." selected={selectedVisualId === 'ratioAnalysis'} onSelect={onVisualSelect ? () => onVisualSelect('ratioAnalysis') : undefined} exportTsv={hasData ? exportSeries(ratioData, [['label', 'Period'], ['tvpi', 'TVPI'], ['dpi', 'DPI']]) : undefined} {...chartCardState(activeExpandedChartId, 'ratioAnalysis', onExpandedChartChange, { bundle, hasData, comparisonBadge: ratioBadge, ...cardContext, dimmed: dimFor(['tvpi', 'dpi']) })}>
          {hasData ? (
            <ResponsiveContainer height={chartHeight(activeExpandedChartId, 'ratioAnalysis', 270)}>
              <AreaChart data={ratioData}>
                <CartesianGrid stroke={gridStroke} vertical={false} />
                <SyncedPeriodHighlight />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={22} />
                <YAxis tickFormatter={ratioAxis} tick={{ fontSize: 11 }} />
                <FormulaTooltip formulas={formulas} logicVersion={logicVersion} metricLookup={{ tvpi: 'ratioAnalysis.TVPI', dpi: 'ratioAnalysis.DPI' }} />
                <Legend />
                {showGhosts ? ghost('tvpi', 'TVPI', true) : null}
                {showGhosts ? ghost('dpi', 'DPI', true) : null}
                <Area isAnimationActive={false} dataKey="tvpi" name="TVPI" fill={colors.gold} stroke={colors.gold} fillOpacity={0.65} />
                <Area isAnimationActive={false} dataKey="dpi" name="DPI" fill={colors.teal} stroke={colors.teal} fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <ChartSkeleton variant="area" height={chartHeight(activeExpandedChartId, 'ratioAnalysis', 270)} legendCount={2} />}
        </ChartCard>
      ) : null}
      {visibility.capitalAtWork ? (
        <ChartCard id="capitalAtWork" title="Capital At Work" help="Capital deployed net of distributions, with commitment reference line." selected={selectedVisualId === 'capitalAtWork'} onSelect={onVisualSelect ? () => onVisualSelect('capitalAtWork') : undefined} exportTsv={hasData ? exportSeries(capitalAtWorkData, [['label', 'Period'], ['capitalAtWork', 'Capital At Work'], ['commitments', 'Commitments']]) : undefined} {...chartCardState(activeExpandedChartId, 'capitalAtWork', onExpandedChartChange, { bundle, hasData, comparisonBadge: capitalAtWorkBadge, ...cardContext, dimmed: dimFor(['capitalAtWork']) })}>
          {hasData ? (
            <ResponsiveContainer height={chartHeight(activeExpandedChartId, 'capitalAtWork', 310)}>
              <LineChart data={capitalAtWorkData}>
                <CartesianGrid stroke={gridStroke} vertical={false} />
                <SyncedPeriodHighlight />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={20} />
                <YAxis tickFormatter={currencyAxis} tick={{ fontSize: 11 }} />
                <FormulaTooltip formulas={formulas} logicVersion={logicVersion} metricLookup={{ capitalAtWork: 'capitalAtWork.Capital At Work', commitments: 'capitalAtWork.Commitments', nonRecallableDistributions: 'capitalAtWork.Non-Recallable Distributions' }} />
                <Legend />
                {showGhosts ? ghost('capitalAtWork', 'Capital At Work') : null}
                <Line isAnimationActive={false} dataKey="capitalAtWork" name="Capital At Work" stroke={colors.gray} strokeWidth={2} dot={false} />
                <Line isAnimationActive={false} dataKey="commitments" name="Commitments" stroke={colors.orange} strokeWidth={2} strokeDasharray="6 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <ChartSkeleton variant="line" height={chartHeight(activeExpandedChartId, 'capitalAtWork', 310)} legendCount={2} />}
        </ChartCard>
      ) : null}
      {/* One quiet line for the whole grid instead of repeating under every card. */}
      <p className="chart-stage__footnote">{LP_TRANSFER_ACTIVITY_FOOTER}</p>
    </div>
  );
}

export function GPCharts({
  bundle,
  formulas,
  logicVersion,
  visibility,
  selectedVisualId,
  onVisualSelect,
  comparison = false,
  lens = 'compare',
  onMetricClick,
  expandedChartId,
  onExpandedChartChange,
}: {
  bundle: ChartBundle | null;
  formulas: FormulaRegistry;
  logicVersion: LogicVersion;
  visibility: Visibility;
  selectedVisualId?: string;
  onVisualSelect?: (visualId: string) => void;
} & ChartFamilyDiffProps & ChartFamilyInteractionProps & ExpandedChartControls) {
  const rawPrograms = bundle?.programSeries ?? [];
  const rawYearData = bundle?.yearSeries ?? [];
  const hasProgramData = rawPrograms.length > 0;
  const hasYearData = rawYearData.length > 0;
  const cmp = comparison && (hasProgramData || hasYearData);
  const PROGRAM_KEYS = ['ltdCommitment', 'ltdUnfunded', 'ltdDeemed', 'ltdCash', 'totalValue', 'investmentValue', 'investmentDistributed', 'carriedInterestDistributed', 'carriedInterestBalance', 'transferOfInterest', 'totalCarriedInterest', 'carryRealizedDistributed', 'carryRealizedUndistributed', 'carryUnrealizedGain', 'carryTransfer'];
  const YEAR_KEYS = ['contributions', 'distributions', 'netCash'];
  const programs = cmp && lens === 'baseline' ? toBaseline(rawPrograms, PROGRAM_KEYS, logicVersion) : rawPrograms;
  const yearData = cmp && lens === 'baseline' ? toBaseline(rawYearData, YEAR_KEYS, logicVersion) : rawYearData;
  const dimProgram = (keys: string[]) => cmp && lens === 'changed' && !seriesChanged(rawPrograms, keys);
  const dimYear = (keys: string[]) => cmp && lens === 'changed' && !seriesChanged(rawYearData, keys);
  const cardContext = { formulas, onMetricClick };
  const ltdBadge = cmp ? comparisonDeltaBadge(rawPrograms, ['ltdCommitment', 'ltdUnfunded', 'ltdDeemed', 'ltdCash'], formatCurrency) : null;
  const tvByProgramBadge = cmp ? comparisonDeltaBadge(rawPrograms, ['totalValue', 'investmentValue', 'investmentDistributed', 'carriedInterestDistributed', 'carriedInterestBalance', 'transferOfInterest'], formatCurrency) : null;
  const carryBadge = cmp ? comparisonDeltaBadge(rawPrograms, ['totalCarriedInterest', 'carryRealizedDistributed', 'carryRealizedUndistributed', 'carryUnrealizedGain', 'carryTransfer'], formatCurrency) : null;
  const cashFlowPeriodBadge = cmp ? comparisonDeltaBadge(rawYearData, ['contributions', 'distributions', 'netCash'], formatCurrency) : null;
  const domain = symmetricDomain(rawYearData.flatMap((point) => [point.contributions, point.distributions, point.netCash]));
  const visibleChartIds = [
    visibility.ltdCommitmentSummaryBar ? 'ltdCommitmentSummaryBar' : '',
    visibility.ltdCommitmentSummaryPie ? 'ltdCommitmentSummaryPie' : '',
    visibility.totalValueByProgramBar ? 'totalValueByProgramBar' : '',
    visibility.totalValueByProgramPie ? 'totalValueByProgramPie' : '',
    visibility.carriedInterestByProgramBar ? 'carriedInterestByProgramBar' : '',
    visibility.carriedInterestByProgramPie ? 'carriedInterestByProgramPie' : '',
    visibility.cashFlowByPeriod ? 'cashFlowByPeriod' : '',
  ].filter(Boolean);
  const activeExpandedChartId = getActiveExpandedChartId(expandedChartId, visibleChartIds);
  return (
    <>
      <div className={chartGridClass(activeExpandedChartId)}>
        {visibility.ltdCommitmentSummaryBar ? (
          <ChartCard id="ltdCommitmentSummaryBar" title="LTD Commitment Summary Bar" help="Sign-aware horizontal bars for cash, deemed, unfunded, and total commitment." selected={selectedVisualId === 'ltdCommitmentSummary'} onSelect={onVisualSelect ? () => onVisualSelect('ltdCommitmentSummary') : undefined} exportTsv={hasProgramData ? () => seriesToTsv(programs, [['programName', 'Program'], ['ltdCash', 'Cash Commitment'], ['ltdDeemed', 'Deemed Commitment'], ['ltdUnfunded', 'Unfunded Commitment'], ['ltdCommitment', 'Life to Date Commitment']]) : undefined} {...chartCardState(activeExpandedChartId, 'ltdCommitmentSummaryBar', onExpandedChartChange, { bundle, hasData: hasProgramData, contextIds: ['ltdCommitmentSummary'], comparisonBadge: ltdBadge, ...cardContext, dimmed: dimProgram(['ltdCommitment', 'ltdUnfunded', 'ltdDeemed', 'ltdCash']) })}>
            {hasProgramData ? (
              <HorizontalProgramBars
                height={chartHeight(activeExpandedChartId, 'ltdCommitmentSummaryBar', 300)}
                data={programs}
                keys={[
                  ['ltdCash', 'Cash Commitment', colors.lavender],
                  ['ltdDeemed', 'Deemed Commitment', colors.green],
                  ['ltdUnfunded', 'Unfunded Commitment', colors.gold],
                ]}
                totalKey="ltdCommitment"
                formulas={formulas}
                logicVersion={logicVersion}
              />
            ) : <ChartSkeleton variant="horizontal" height={chartHeight(activeExpandedChartId, 'ltdCommitmentSummaryBar', 300)} legendCount={4} />}
          </ChartCard>
        ) : null}
        {visibility.ltdCommitmentSummaryPie ? (
          <ChartCard id="ltdCommitmentSummaryPie" title="LTD Commitment Summary Pie" help="Nested donut. Suppressed visibly when signed segments are negative." selected={selectedVisualId === 'ltdCommitmentSummary'} onSelect={onVisualSelect ? () => onVisualSelect('ltdCommitmentSummary') : undefined} exportTsv={hasProgramData && bundle && !bundle.pies.ltdCommitment.suppressed ? () => pieModelToTsv(bundle.pies.ltdCommitment) : undefined} {...chartCardState(activeExpandedChartId, 'ltdCommitmentSummaryPie', onExpandedChartChange, { bundle, hasData: hasProgramData, contextIds: ['ltdCommitmentSummary'], comparisonBadge: ltdBadge, ...cardContext, dimmed: dimProgram(['ltdCommitment', 'ltdUnfunded', 'ltdDeemed', 'ltdCash']) })}>
            {hasProgramData && bundle ? <NestedPie model={bundle.pies.ltdCommitment} height={chartHeight(activeExpandedChartId, 'ltdCommitmentSummaryPie', 300)} formulas={formulas} logicVersion={logicVersion} /> : <ChartSkeleton variant="donut" height={chartHeight(activeExpandedChartId, 'ltdCommitmentSummaryPie', 300)} legendCount={3} />}
          </ChartCard>
        ) : null}
        {visibility.totalValueByProgramBar ? (
          <ChartCard id="totalValueByProgramBar" title="Total Value By Program Bar" help="Program bars using production investment activity logic unless changed in draft." selected={selectedVisualId === 'totalValueByProgram'} onSelect={onVisualSelect ? () => onVisualSelect('totalValueByProgram') : undefined} exportTsv={hasProgramData ? () => seriesToTsv(programs, [['programName', 'Program'], ['investmentValue', 'Investment Value'], ['investmentDistributed', 'Investment Distributed'], ['carriedInterestDistributed', 'Carried Interest Distributed'], ['carriedInterestBalance', 'Carried Interest Balance'], ['transferOfInterest', 'Transfer of Interest'], ['totalValue', 'Total Value']]) : undefined} {...chartCardState(activeExpandedChartId, 'totalValueByProgramBar', onExpandedChartChange, { bundle, hasData: hasProgramData, contextIds: ['totalValueByProgram'], comparisonBadge: tvByProgramBadge, ...cardContext, dimmed: dimProgram(['totalValue', 'investmentValue', 'investmentDistributed', 'carriedInterestDistributed', 'carriedInterestBalance', 'transferOfInterest']) })}>
            {hasProgramData ? (
              <HorizontalProgramBars
                height={chartHeight(activeExpandedChartId, 'totalValueByProgramBar', 300)}
                data={programs}
                keys={[
                  ['investmentValue', 'Investment Value', colors.purple],
                  ['investmentDistributed', 'Investment Distributed', colors.teal],
                  ['carriedInterestDistributed', 'Carried Interest Distributed', colors.gold],
                  ['carriedInterestBalance', 'Carried Interest Balance', colors.lavender],
                  ['transferOfInterest', 'Transfer of Interest', colors.orange],
                ]}
                totalKey="totalValue"
                formulas={formulas}
                logicVersion={logicVersion}
              />
            ) : <ChartSkeleton variant="horizontal" height={chartHeight(activeExpandedChartId, 'totalValueByProgramBar', 300)} legendCount={5} />}
          </ChartCard>
        ) : null}
        {visibility.totalValueByProgramPie ? (
          <ChartCard id="totalValueByProgramPie" title="Total Value By Program Pie" help="Nested donut with raw signed values in tooltip; negative wedges are suppressed." selected={selectedVisualId === 'totalValueByProgram'} onSelect={onVisualSelect ? () => onVisualSelect('totalValueByProgram') : undefined} exportTsv={hasProgramData && bundle && !bundle.pies.totalValue.suppressed ? () => pieModelToTsv(bundle.pies.totalValue) : undefined} {...chartCardState(activeExpandedChartId, 'totalValueByProgramPie', onExpandedChartChange, { bundle, hasData: hasProgramData, contextIds: ['totalValueByProgram'], comparisonBadge: tvByProgramBadge, ...cardContext, dimmed: dimProgram(['totalValue', 'investmentValue', 'investmentDistributed', 'carriedInterestDistributed', 'carriedInterestBalance', 'transferOfInterest']) })}>
            {hasProgramData && bundle ? <NestedPie model={bundle.pies.totalValue} height={chartHeight(activeExpandedChartId, 'totalValueByProgramPie', 300)} formulas={formulas} logicVersion={logicVersion} /> : <ChartSkeleton variant="donut" height={chartHeight(activeExpandedChartId, 'totalValueByProgramPie', 300)} legendCount={4} />}
          </ChartCard>
        ) : null}
        {visibility.carriedInterestByProgramBar ? (
          <ChartCard id="carriedInterestByProgramBar" title="Carried Interest By Program Bar" help="Carry paid, realized, unrealized, and transfer values by program." selected={selectedVisualId === 'carriedInterestByProgram'} onSelect={onVisualSelect ? () => onVisualSelect('carriedInterestByProgram') : undefined} exportTsv={hasProgramData ? () => seriesToTsv(programs, [['programName', 'Program'], ['carryRealizedDistributed', 'Realized - Distributed'], ['carryRealizedUndistributed', 'Realized - Undistributed'], ['carryUnrealizedGain', 'Unrealized Gain'], ['carryTransfer', 'Carry Transfer'], ['totalCarriedInterest', 'Total Carried Interest']]) : undefined} {...chartCardState(activeExpandedChartId, 'carriedInterestByProgramBar', onExpandedChartChange, { bundle, hasData: hasProgramData, contextIds: ['carriedInterestByProgram'], comparisonBadge: carryBadge, ...cardContext, dimmed: dimProgram(['totalCarriedInterest', 'carryRealizedDistributed', 'carryRealizedUndistributed', 'carryUnrealizedGain', 'carryTransfer']) })}>
            {hasProgramData ? (
              <HorizontalProgramBars
                height={chartHeight(activeExpandedChartId, 'carriedInterestByProgramBar', 300)}
                data={programs}
                keys={[
                  ['carryRealizedDistributed', 'Realized - Distributed', colors.green],
                  ['carryRealizedUndistributed', 'Realized - Undistributed', colors.gold],
                  ['carryUnrealizedGain', 'Unrealized Gain', colors.purple],
                  ['carryTransfer', 'Carry Transfer', colors.teal],
                ]}
                totalKey="totalCarriedInterest"
                formulas={formulas}
                logicVersion={logicVersion}
              />
            ) : <ChartSkeleton variant="horizontal" height={chartHeight(activeExpandedChartId, 'carriedInterestByProgramBar', 300)} legendCount={4} />}
          </ChartCard>
        ) : null}
        {visibility.carriedInterestByProgramPie ? (
          <ChartCard id="carriedInterestByProgramPie" title="Carried Interest By Program Pie" help="Nested donut for carry type and program split." selected={selectedVisualId === 'carriedInterestByProgram'} onSelect={onVisualSelect ? () => onVisualSelect('carriedInterestByProgram') : undefined} exportTsv={hasProgramData && bundle && !bundle.pies.carriedInterest.suppressed ? () => pieModelToTsv(bundle.pies.carriedInterest) : undefined} {...chartCardState(activeExpandedChartId, 'carriedInterestByProgramPie', onExpandedChartChange, { bundle, hasData: hasProgramData, contextIds: ['carriedInterestByProgram'], comparisonBadge: carryBadge, ...cardContext, dimmed: dimProgram(['totalCarriedInterest', 'carryRealizedDistributed', 'carryRealizedUndistributed', 'carryUnrealizedGain', 'carryTransfer']) })}>
            {hasProgramData && bundle ? <NestedPie model={bundle.pies.carriedInterest} height={chartHeight(activeExpandedChartId, 'carriedInterestByProgramPie', 300)} formulas={formulas} logicVersion={logicVersion} /> : <ChartSkeleton variant="donut" height={chartHeight(activeExpandedChartId, 'carriedInterestByProgramPie', 300)} legendCount={4} />}
          </ChartCard>
        ) : null}
        {visibility.cashFlowByPeriod ? (
          <ChartCard id="cashFlowByPeriod" title="Cash Flow By Period" help="Yearly contributions below axis, distributions above, and net cash line." selected={selectedVisualId === 'cashFlowByPeriod'} onSelect={onVisualSelect ? () => onVisualSelect('cashFlowByPeriod') : undefined} exportTsv={hasYearData ? () => seriesToTsv(yearData, [['label', 'Year'], ['distributions', 'Distributions'], ['contributions', 'Contributions'], ['netCash', 'Net Cash']]) : undefined} {...chartCardState(activeExpandedChartId, 'cashFlowByPeriod', onExpandedChartChange, { bundle, hasData: hasYearData, comparisonBadge: cashFlowPeriodBadge, ...cardContext, dimmed: dimYear(['contributions', 'distributions', 'netCash']) })} wide>
            {hasYearData ? (
              <ResponsiveContainer height={chartHeight(activeExpandedChartId, 'cashFlowByPeriod', 320)}>
                <ComposedChart data={yearData}>
                  <CartesianGrid stroke={gridStroke} vertical={false} />
                  <SyncedPeriodHighlight />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={currencyAxis} domain={domain} tick={{ fontSize: 11 }} />
                  <FormulaTooltip formulas={formulas} logicVersion={logicVersion} metricLookup={{ contributions: 'cashFlowByPeriod.Contributions', distributions: 'cashFlowByPeriod.Distributions', netCash: 'cashFlowByPeriod.Net Cash' }} />
                  <Legend />
                  <ReferenceLine y={0} stroke={axisStroke} />
                  <Bar isAnimationActive={false} dataKey="distributions" name="Distributions" fill={colors.navy} />
                  <Bar isAnimationActive={false} dataKey="contributions" name="Contributions" fill={colors.lightBlue} />
                  <Line isAnimationActive={false} dataKey="netCash" name="Net Cash" stroke={colors.gold} strokeWidth={2} dot={{ r: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <ChartSkeleton variant="cashFlow" height={chartHeight(activeExpandedChartId, 'cashFlowByPeriod', 320)} legendCount={3} />}
          </ChartCard>
        ) : null}
      </div>
    </>
  );
}

function HorizontalProgramBars({
  height = 300,
  data,
  keys,
  totalKey,
  formulas,
  logicVersion,
}: {
  height?: ContainerHeight;
  data: ChartBundle['programSeries'];
  keys: Array<[keyof ChartBundle['programSeries'][number], string, string]>;
  totalKey: keyof ChartBundle['programSeries'][number];
  formulas: FormulaRegistry;
  logicVersion: LogicVersion;
}) {
  return (
    <ResponsiveContainer height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 34, top: 16, bottom: 12 }}>
        <CartesianGrid stroke={gridStroke} horizontal={false} />
        <XAxis type="number" tickFormatter={currencyAxis} tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="programName" width={150} tick={{ fontSize: 10 }} />
        <FormulaTooltip formulas={formulas} logicVersion={logicVersion} metricLookup={programTooltipLookup(keys, totalKey)} contextLabel="Program" />
        <Legend />
        {keys.map(([key, name, color]) => (
          <Bar isAnimationActive={false} key={String(key)} dataKey={String(key)} name={name} stackId="program" fill={color} />
        ))}
        <Line isAnimationActive={false} dataKey={String(totalKey)} name="Total" stroke={colors.navy} dot={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function NestedPie({
  model,
  height = 300,
  formulas,
  logicVersion,
}: {
  model: ChartBundle['pies']['ltdCommitment'];
  height?: ContainerHeight;
  formulas: FormulaRegistry;
  logicVersion: LogicVersion;
}) {
  if (model.suppressed) {
    return <EmptyState title="Pie suppressed" detail={model.reason ?? 'Negative values cannot be represented truthfully as wedges.'} />;
  }
  if (!model.inner.length && !model.outer.length) return <EmptyState title="No pie values" detail="No non-zero program segments are available." />;
  return (
    <ResponsiveContainer height={height}>
      <PieChart>
        <FormulaTooltip formulas={formulas} logicVersion={logicVersion} metricLookup={{}} contextLabel="Segment" />
        <Legend />
        <Pie isAnimationActive={false} data={model.inner} dataKey="value" nameKey="name" innerRadius={0} outerRadius={70} paddingAngle={1}>
          {model.inner.map((entry, index) => (
            <Cell key={entry.name} fill={piePalette[index % piePalette.length]} stroke={surfaceStroke} strokeWidth={1.5} />
          ))}
        </Pie>
        <Pie
          data={model.outer}
          dataKey="value"
          nameKey="name"
          innerRadius={86}
          outerRadius={106}
          paddingAngle={1}
          labelLine={{ stroke: leaderStroke, strokeWidth: 1 }}
          label={renderPieLabel}
        >
          {model.outer.map((entry, index) => (
            <Cell key={`${entry.category}-${entry.name}`} fill={piePalette[(index + 3) % piePalette.length]} stroke={surfaceStroke} strokeWidth={2} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

function programTooltipLookup(
  keys: Array<[keyof ChartBundle['programSeries'][number], string, string]>,
  totalKey: keyof ChartBundle['programSeries'][number],
): Record<string, string> {
  return Object.fromEntries(
    [...keys.map(([key]) => key), totalKey]
      .map((key) => {
        const formulaKey = programMetricLookup[key];
        return formulaKey ? [String(key), formulaKey] : null;
      })
      .filter((entry): entry is [string, string] => Boolean(entry)),
  );
}

function renderPieLabel(props: PieLabelRenderProps) {
  const value = Number(props.value ?? 0);
  if (!Number.isFinite(value) || value === 0) return null;
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const midAngle = Number(props.midAngle ?? 0);
  const textAnchor = Math.cos((-midAngle * Math.PI) / 180) >= 0 ? 'start' : 'end';
  return (
    <text x={x} y={y} textAnchor={textAnchor} dominantBaseline="central" className="pie-leader-label">
      {formatCurrency(value)}
    </text>
  );
}

function symmetricDomain(values: number[]): [number, number] {
  const max = Math.max(1, ...values.map((value) => Math.abs(value)));
  return [-max, max];
}

function ChartSkeleton({ variant, height, legendCount }: { variant: SkeletonVariant; height: ContainerHeight; legendCount: number }) {
  if (variant === 'donut') {
    return (
      <div className="chart-skeleton chart-skeleton-donut" style={{ minHeight: height }} aria-hidden="true">
        <div className="skeleton-donut-layout">
          <div className="skeleton-donut-shape" />
          <div className="skeleton-donut-labels">
            {Array.from({ length: 5 }).map((_, index) => (
              <span key={index} className="skeleton-text" />
            ))}
          </div>
        </div>
        <SkeletonLegend count={legendCount} />
      </div>
    );
  }

  if (variant === 'horizontal') {
    return (
      <div className="chart-skeleton chart-skeleton-horizontal" style={{ minHeight: height }} aria-hidden="true">
        <div className="skeleton-horizontal-list">
          {[76, 58, 88, 44, 66].map((width, index) => (
            <div className="skeleton-horizontal-row" key={index}>
              <span className="skeleton-text skeleton-horizontal-label" />
              <span className="skeleton-horizontal-track">
                <span className="skeleton-horizontal-bar" style={{ width: `${width}%` }} />
              </span>
            </div>
          ))}
        </div>
        <SkeletonLegend count={legendCount} />
      </div>
    );
  }

  return (
    <div className={`chart-skeleton chart-skeleton-${variant}`} style={{ minHeight: height }} aria-hidden="true">
      <div className="skeleton-chart-frame">
        <div className="skeleton-y-axis">
          {Array.from({ length: 5 }).map((_, index) => (
            <span key={index} className="skeleton-text" />
          ))}
        </div>
        <div className="skeleton-plot-area">
          {variant === 'line' ? <span className="skeleton-line-path secondary" /> : null}
          {variant === 'area' || variant === 'cashFlow' ? <span className="skeleton-area-shape" /> : null}
          {variant === 'combo' || variant === 'stacked' || variant === 'cashFlow' ? (
            <div className="skeleton-bar-series">
              {[48, 72, 55, 86, 64, 78, 44].map((barHeight, index) => (
                <span key={index} style={{ height: `${barHeight}%` }}>
                  {variant === 'stacked' ? <em /> : null}
                </span>
              ))}
            </div>
          ) : null}
          <span className="skeleton-line-path" />
        </div>
        <div className="skeleton-x-axis">
          {Array.from({ length: 6 }).map((_, index) => (
            <span key={index} className="skeleton-text" />
          ))}
        </div>
      </div>
      <SkeletonLegend count={legendCount} />
    </div>
  );
}

function SkeletonLegend({ count }: { count: number }) {
  return (
    <div className="skeleton-legend">
      {Array.from({ length: count }).map((_, index) => (
        <span key={index}>
          <i />
          <b className="skeleton-text" />
        </span>
      ))}
    </div>
  );
}
