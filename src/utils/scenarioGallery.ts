import type { NumericKey } from '../data/columns';
import type { BIRow, FormulaRegistry, LogicVersion, QuarterPoint, ScenarioVisualId, SignToken } from '../types';
import { computeQuarterSeries } from './charts';
import { SCENARIO_VISUALS, classifyMetrics, deriveScenarioMetrics } from './scenarioClassifier';
import { applyScenarioOverrides, type ScenarioOverrideMap, type ScenarioPolarity } from './scenarioSimulation';

// ── Scenario Gallery model ───────────────────────────────────────────────────
// Everything in the gallery is about ONE selected investor. We enumerate every
// distinct way the visual can look by forcing that investor's rows across the
// source-sign space (magnitude-preserving, so the real time-shape survives),
// classify the FORCED rows through the app's own metric derivation so labels
// match the charts, and dedupe to the reachable set. Exactly one of those is the
// investor's ACTUAL scenario (forcing into its own signs is the identity, so its
// chart is the real data); the rest are synthetic what-ifs for this investor.

export type GalleryScenario = {
  id: string;
  label: string;
  signs: SignToken[];
  /** True for the scenario the selected investor genuinely sits in (its real, unforced data). */
  actual: boolean;
  quarterSeries: QuarterPoint[];
};

export type GallerySummary = {
  visualId: ScenarioVisualId;
  chartId: string;
  title: string;
  scenarios: GalleryScenario[];
};

type MetricKey = 'contributions' | 'distributions' | 'commitments' | 'unfunded' | 'capitalAccountBalance' | 'recallable';

const METRIC_FIELD: Record<MetricKey, NumericKey> = {
  contributions: 'totalContributions',
  distributions: 'totalDistributions',
  commitments: 'investorTotalCommitments',
  unfunded: 'investorAvailableUnfundedCommitments',
  capitalAccountBalance: 'capitalAccountBalance',
  recallable: 'recallableDistributions',
};

// The independent source metrics that drive each visual's scenario signs. Total
// Value and Capital At Work expose derived signs (Total Value, % Deployed, …),
// so we vary only their free inputs and let the derived signs follow — dedupe by
// label collapses the result to the reachable set.
const VISUAL_INPUTS: Record<ScenarioVisualId, MetricKey[]> = {
  cashFlow: ['contributions', 'distributions'],
  commitment: ['commitments', 'unfunded'],
  ratio: ['contributions', 'distributions', 'capitalAccountBalance'],
  totalValue: ['capitalAccountBalance', 'distributions'],
  capitalAtWork: ['commitments', 'unfunded', 'distributions', 'recallable'],
};

const ALL_METRICS = Object.keys(METRIC_FIELD) as MetricKey[];
const SIGNS: SignToken[] = ['-', '0', '+'];

function signCombos(n: number): SignToken[][] {
  if (n === 0) return [[]];
  const rest = signCombos(n - 1);
  return SIGNS.flatMap((sign) => rest.map((tail) => [sign, ...tail]));
}

type Sums = Record<MetricKey, number>;
const EPSILON = 0.005;

function absSums(rows: BIRow[]): Sums {
  const abs: Sums = { contributions: 0, distributions: 0, commitments: 0, unfunded: 0, capitalAccountBalance: 0, recallable: 0 };
  for (const row of rows) {
    for (const metric of ALL_METRICS) abs[metric] += Math.abs(Number(row[METRIC_FIELD[metric]] ?? 0));
  }
  return abs;
}

function sumMetrics(rows: BIRow[]): Sums {
  const sums: Sums = { contributions: 0, distributions: 0, commitments: 0, unfunded: 0, capitalAccountBalance: 0, recallable: 0 };
  for (const row of rows) {
    for (const metric of ALL_METRICS) sums[metric] += Number(row[METRIC_FIELD[metric]] ?? 0);
  }
  return sums;
}

// Magnitude-preserving sign force when the field has real magnitude (keeps the
// real time-shape); a floored synthetic ramp when the base is empty in that
// field (so every sign combination stays reachable from any investor).
function polarityFor(sign: SignToken, hasMagnitude: boolean): ScenarioPolarity {
  if (sign === '0') return 'zero';
  if (hasMagnitude) return sign === '+' ? 'forcePositive' : 'forceNegative';
  return sign === '+' ? 'positive' : 'negative';
}

/** True when the gallery can meaningfully run for the given rows. */
export function canBuildGallery(rows: BIRow[] | undefined | null): boolean {
  return Boolean(rows && rows.length);
}

export function buildGallery(
  visualId: ScenarioVisualId,
  baseRows: BIRow[],
  formulas: FormulaRegistry,
  logicVersion: LogicVersion,
  cumulative: boolean,
): GallerySummary {
  const visual = SCENARIO_VISUALS.find((entry) => entry.id === visualId) ?? SCENARIO_VISUALS[0];
  const inputs = VISUAL_INPUTS[visualId];
  const abs = absSums(baseRows);
  // The selected investor's own scenario for this visual — its real, unforced data.
  const actualLabel = classifyMetrics(deriveScenarioMetrics(sumMetrics(baseRows)))[visualId].label;

  // Force the base rows into every source-sign combination, then classify the
  // FORCED rows so the label always matches the chart. Dedupe by label collapses
  // unreachable / degenerate tuples to the distinct reachable set.
  const distinct = new Map<string, { signs: SignToken[]; forcedRows: BIRow[] }>();
  for (const combo of signCombos(inputs.length)) {
    const fields: NumericKey[] = [];
    const overrides: ScenarioOverrideMap = {};
    inputs.forEach((metric, index) => {
      const field = METRIC_FIELD[metric];
      fields.push(field);
      overrides[field] = polarityFor(combo[index], abs[metric] > EPSILON);
    });
    const forcedRows = applyScenarioOverrides(baseRows, fields, overrides, 'all');
    const classified = classifyMetrics(deriveScenarioMetrics(sumMetrics(forcedRows)))[visualId];
    if (!distinct.has(classified.label)) distinct.set(classified.label, { signs: classified.signs, forcedRows });
  }

  const scenarios: GalleryScenario[] = Array.from(distinct, ([label, { signs, forcedRows }]) => ({
    id: `${visualId}::${label}`,
    label,
    signs,
    actual: label === actualLabel,
    quarterSeries: computeQuarterSeries(forcedRows, formulas, logicVersion, cumulative),
  }));

  // The investor's actual scenario first, then the synthetic what-ifs by sign.
  scenarios.sort((a, b) => Number(b.actual) - Number(a.actual) || a.label.localeCompare(b.label));

  return { visualId, chartId: visual.chartId, title: visual.title, scenarios };
}

/** Compact filename stem for an exported scenario PNG, e.g. `commitment-pos-pos`. */
export function scenarioSlug(visualId: ScenarioVisualId, signs: readonly SignToken[]): string {
  const tokens = signs.map((sign) => (sign === '+' ? 'pos' : sign === '-' ? 'neg' : '0'));
  return `${visualId}-${tokens.join('-')}`;
}
