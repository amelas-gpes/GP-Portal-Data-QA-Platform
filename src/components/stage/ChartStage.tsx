import type {
  ChartBundle,
  FormulaRegistry,
  KpiSummary,
  LogicVersion,
  QuarterPoint,
} from '../../types';
import { formatCurrency } from '../../utils/format';
import { GPCharts, LPCharts, type Visibility } from '../Charts';
import { SkeletonText } from '../common';
import { PeriodHoverProvider } from './PeriodHoverContext';

const KPI_DELTA_EPSILON = 0.005;

function signedCurrency(delta: number): string {
  return delta > 0 ? `+${formatCurrency(delta)}` : formatCurrency(delta);
}

// ── KpiBand ──────────────────────────────────────────────────────────────────

const KPI_LABELS = ['Total Commitment', 'Total Value', 'Total Carried Interest', 'Rows'] as const;

function KpiDelta({ delta }: { delta: number }) {
  if (Math.abs(delta) < KPI_DELTA_EPSILON) return null;
  const signed = signedCurrency(delta);
  return (
    <span className="kpi-band__delta" data-tone={delta > 0 ? 'pos' : 'neg'} title={`What-if minus baseline: ${signed}`}>
      Δ {signed}
    </span>
  );
}

function KpiBand({
  bundle,
  simKpis,
  baselineKpis,
}: {
  bundle: ChartBundle | null;
  simKpis: KpiSummary | null;
  baselineKpis: KpiSummary | null;
}) {
  if (!bundle) {
    return (
      <div className="kpi-band" data-loading="true" aria-busy="true" role="group" aria-label="Key figures">
        {KPI_LABELS.map((label) => (
          <div className="kpi-band__item" key={label}>
            <span className="kpi-band__label">{label}</span>
            <SkeletonText className="kpi-band__value" />
          </div>
        ))}
      </div>
    );
  }
  const moneyFacts: Array<{ label: string; value: number; delta: number | null }> = [
    {
      label: 'Total Commitment',
      value: bundle.kpis.totalCommitment,
      delta: simKpis && baselineKpis ? simKpis.totalCommitment - baselineKpis.totalCommitment : null,
    },
    {
      label: 'Total Value',
      value: bundle.kpis.totalValue,
      delta: simKpis && baselineKpis ? simKpis.totalValue - baselineKpis.totalValue : null,
    },
    {
      label: 'Total Carried Interest',
      value: bundle.kpis.totalCarriedInterest,
      delta: simKpis && baselineKpis ? simKpis.totalCarriedInterest - baselineKpis.totalCarriedInterest : null,
    },
  ];
  return (
    <div className="kpi-band" role="group" aria-label="Key figures">
      {moneyFacts.map((fact) => (
        <div className="kpi-band__item" key={fact.label}>
          <span className="kpi-band__label">{fact.label}</span>
          <strong className="kpi-band__value">{formatCurrency(fact.value)}</strong>
          {fact.delta !== null ? <KpiDelta delta={fact.delta} /> : null}
        </div>
      ))}
      <div className="kpi-band__item" key="Rows">
        <span className="kpi-band__label">Rows</span>
        <strong className="kpi-band__value">{bundle.rowCount.toLocaleString()}</strong>
      </div>
    </div>
  );
}

// ── ChartStage ───────────────────────────────────────────────────────────────

export function ChartStage({
  side,
  viewMode,
  bundle,
  individualBundles,
  formulas,
  logicVersion,
  visibility,
  simArmed,
  simQuarterSeries,
  simKpis,
  baselineKpis,
  computePending,
  expandedChartId,
  onExpandedChartChange,
  onMetricClick,
  scenarioSummary,
}: {
  side: 'lp' | 'gp';
  viewMode: 'combined' | 'individual';
  bundle: ChartBundle | null;
  individualBundles: ChartBundle[];
  formulas: FormulaRegistry;
  logicVersion: LogicVersion;
  visibility: Visibility;
  simArmed: boolean;
  simQuarterSeries: QuarterPoint[] | null;
  simKpis: KpiSummary | null;
  baselineKpis: KpiSummary | null;
  computePending: boolean;
  expandedChartId: string | null;
  onExpandedChartChange: (chartId: string | null) => void;
  onMetricClick: (metricId: string) => void;
  /** The investor's scenario summary card (LP only) — rendered above the charts. */
  scenarioSummary?: React.ReactNode;
}) {
  // LP what-if renders against the combined bundle with the simulated quarter
  // series swapped in; `${key}__base` ghost fields are already merged.
  const lpSimBundle: ChartBundle | null =
    simArmed && side === 'lp' && simQuarterSeries && bundle
      ? { ...bundle, quarterSeries: simQuarterSeries }
      : null;

  const Family = side === 'gp' ? GPCharts : LPCharts;

  const combinedFamily = lpSimBundle ? (
    <LPCharts
      bundle={lpSimBundle}
      formulas={formulas}
      logicVersion={logicVersion}
      visibility={visibility}
      comparison
      precomputedBaseline
      ghostTone="sim"
      lens="compare"
      onMetricClick={onMetricClick}
      expandedChartId={expandedChartId}
      onExpandedChartChange={onExpandedChartChange}
    />
  ) : (
    <Family
      bundle={bundle}
      formulas={formulas}
      logicVersion={logicVersion}
      visibility={visibility}
      onMetricClick={onMetricClick}
      expandedChartId={expandedChartId}
      onExpandedChartChange={onExpandedChartChange}
    />
  );

  const individualMode = viewMode === 'individual' && individualBundles.length > 1;

  return (
    <section
      className="chart-stage"
      data-stale={computePending ? 'true' : undefined}
      data-diff-armed={simArmed ? 'true' : undefined}
      aria-label="Chart stage"
    >
      <KpiBand bundle={bundle} simKpis={simKpis} baselineKpis={baselineKpis} />

      {side === 'lp' && scenarioSummary ? scenarioSummary : null}

      {/* Synced period hover: every visible chart shares one hovered-period store. */}
      <PeriodHoverProvider>
        {individualMode ? (
          individualBundles.map((instance, index) => {
            const name =
              instance.selectedInvestor?.investorPortalDisplayName
              ?? instance.selectedInvestor?.label
              ?? instance.investorKey
              ?? `Investor ${index + 1}`;
            return (
              <section className="chart-stage__instance" key={instance.investorKey ?? `${name}-${index}`}>
                <header className="chart-stage__instance-header">
                  <strong className="chart-stage__instance-name">{name}</strong>
                  <span className="chart-stage__instance-meta">
                    {instance.rowCount.toLocaleString()} rows · {formatCurrency(instance.kpis.totalValue)}
                  </span>
                </header>
                <Family
                  bundle={instance}
                  formulas={formulas}
                  logicVersion={logicVersion}
                  visibility={visibility}
                  onMetricClick={onMetricClick}
                />
              </section>
            );
          })
        ) : (
          combinedFamily
        )}
      </PeriodHoverProvider>
    </section>
  );
}
