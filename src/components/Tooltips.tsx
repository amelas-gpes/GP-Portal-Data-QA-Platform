import type { FormulaMetric, FormulaRegistry, LogicVersion, TooltipMetricContext, TooltipMetricContextMap } from '../types';
import { formatCurrency, formatRatio } from '../utils/format';

type TooltipPayload = {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: {
    name?: string;
    category?: string;
    tooltipMetricKey?: string;
    tooltipMetrics?: TooltipMetricContextMap;
    rowCount?: number;
  };
};

export function FinancialTooltip({
  active,
  payload,
  label,
  formulas,
  logicVersion,
  metricLookup,
  contextLabel = 'Period',
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: unknown;
  formulas: FormulaRegistry;
  logicVersion: LogicVersion;
  metricLookup: Record<string, string>;
  contextLabel?: string;
}) {
  if (!active || !payload?.length) return null;
  const knownMetricKeys = new Set(Object.keys(metricLookup));
  const visiblePayload = knownMetricKeys.size
    ? payload.filter((item) => knownMetricKeys.has(String(item.dataKey ?? '')))
    : payload;
  if (!visiblePayload.length) return null;
  const headingValue = tooltipHeadingValue(label, visiblePayload[0]);
  return (
    <div className="chart-tooltip">
      <div className="tooltip-heading">
        <span>{contextLabel}</span>
        <strong>{headingValue}</strong>
      </div>
      {visiblePayload.map((item: TooltipPayload) => {
        const key = String(item.dataKey ?? '');
        const formulaKey = metricLookup[key] ?? item.payload?.tooltipMetricKey;
        const metric = formulaKey ? formulas[formulaKey] : null;
        const value = Number(item.value ?? 0);
        const currentValue = Number.isFinite(value) ? value : 0;
        const tooltipMetric = tooltipMetricContext(item, key, formulaKey, currentValue);
        const isRatio = isRatioMetric(key, metric);
        const formatted = isRatio ? formatRatio(currentValue) : formatCurrency(currentValue);
        const formula = metric ? (logicVersion === 'production' ? metric.productionFormula : metric.draftFormula) : null;
        const signTreatment = signTreatmentLabel(metric, formula, isRatio);
        const title = tooltipMetricTitle(item, key);
        return (
          <div key={`${key}-${item.name}`} className="tooltip-row">
            <div className="tooltip-metric-title">
              <span className="tooltip-color" style={{ background: item.color ?? '#94a3b8' }} />
              <b>{title}</b>
            </div>
            <div className="tooltip-value-card">
              <span>Value shown</span>
              <strong className="tooltip-value">{formatted}</strong>
            </div>
            <div className="tooltip-quiet-context">
              <span>{tooltipMetric.rowCount.toLocaleString()} {tooltipMetric.rowCount === 1 ? 'row' : 'rows'}</span>
              <span>{signTreatment}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function tooltipMetricContext(
  item: TooltipPayload,
  dataKey: string,
  formulaKey: string | undefined,
  currentValue: number,
): TooltipMetricContext {
  const fromPayload = item.payload?.tooltipMetrics?.[dataKey] ?? (formulaKey ? item.payload?.tooltipMetrics?.[formulaKey] : undefined);
  if (fromPayload) return fromPayload;
  return {
    productionValue: currentValue,
    draftValue: currentValue,
    delta: 0,
    rowCount: item.payload?.rowCount ?? 0,
  };
}

function tooltipHeadingValue(label: unknown, item: TooltipPayload): string {
  if (label !== null && label !== undefined && String(label).trim()) return String(label);
  if (item.payload?.category && item.payload.name) return `${item.payload.category} - ${item.payload.name}`;
  return String(item.payload?.name ?? item.name ?? 'Selection');
}

function tooltipMetricTitle(item: TooltipPayload, dataKey: string): string {
  if (item.payload?.category && item.payload.name) return item.payload.category;
  return String(item.name ?? dataKey);
}

function isRatioMetric(key: string, metric: FormulaMetric | null): boolean {
  const formula = `${metric?.productionFormula ?? ''} ${metric?.draftFormula ?? ''}`.toLowerCase();
  return key.toLowerCase().includes('tvpi') || key.toLowerCase().includes('dpi') || key.toLowerCase().includes('ratio') || formula.includes('safe_divide');
}

function signTreatmentLabel(metric: FormulaMetric | null, formula: string | null, isRatio: boolean): string {
  if (isRatio) return 'Ratio guard';
  if (!metric && !formula) return 'Unknown';
  const normalizedFormula = formula?.toUpperCase() ?? '';
  if (metric?.absUsed || normalizedFormula.includes('ABS_SUM') || normalizedFormula.includes('ABS(')) return 'Absolute value';
  if (normalizedFormula.includes('NEG_SUM') || normalizedFormula.includes('NEG(')) return 'Sign flipped';
  if (normalizedFormula.replace(/\s+/g, '').includes('*-1')) return 'Sign flipped';
  return 'Signed';
}
