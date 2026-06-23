import type {
  BIRow,
  GrossComponents,
  InvestorScenarioMetrics,
  InvestorScenarioRecord,
  InvestorScenarioTimeline,
  ScenarioBucket,
  ScenarioGross,
  ScenarioMetricKey,
  ScenarioModel,
  ScenarioSpan,
  ScenarioVisualId,
  SignToken,
} from '../types';
import { MONEY_EPSILON } from './aggregation';

// Sign-pattern scenario classifier (per RRE Scenarios.xlsx). A scenario is the
// sign tuple of an investor's aggregated metrics, one label per visual. Signs
// are taken from RAW ledger values so labels reproduce the workbook exactly:
// a paid-in contribution is negative; returned cash (distribution) is positive.
//
// Verified against all 473 workbook investors (0 mismatches) — see
// src/test/scenarioClassifier.test.ts.

export const SCENARIO_VISUALS: ReadonlyArray<{ id: ScenarioVisualId; title: string; chartId: string }> = [
  { id: 'cashFlow', title: 'Cash Flow', chartId: 'cashFlowSummary' },
  { id: 'commitment', title: 'Commitment Summary', chartId: 'commitmentSummary' },
  { id: 'ratio', title: 'Ratio Analysis', chartId: 'ratioAnalysis' },
  { id: 'totalValue', title: 'Total Value', chartId: 'totalValue' },
  { id: 'capitalAtWork', title: 'Capital At Work', chartId: 'capitalAtWork' },
];

export const SCENARIO_VISUAL_IDS: ScenarioVisualId[] = SCENARIO_VISUALS.map((visual) => visual.id);

const SCENARIO_VISUAL_TITLE = new Map(SCENARIO_VISUALS.map((visual) => [visual.id, visual.title]));

export function scenarioVisualTitle(visualId: ScenarioVisualId): string {
  return SCENARIO_VISUAL_TITLE.get(visualId) ?? visualId;
}

/** Sign of a money amount, with sub-cent residue treated as zero. */
export function moneySign(value: number): SignToken {
  if (!Number.isFinite(value) || Math.abs(value) <= MONEY_EPSILON) return '0';
  return value > 0 ? '+' : '-';
}

type MetricSums = {
  contributions: number;
  distributions: number;
  commitments: number;
  unfunded: number;
  capitalAccountBalance: number;
  recallable: number;
};

function emptySums(): MetricSums {
  return { contributions: 0, distributions: 0, commitments: 0, unfunded: 0, capitalAccountBalance: 0, recallable: 0 };
}

function addRow(sums: MetricSums, row: BIRow): void {
  sums.contributions += Number(row.totalContributions ?? 0);
  sums.distributions += Number(row.totalDistributions ?? 0);
  sums.commitments += Number(row.investorTotalCommitments ?? 0);
  sums.unfunded += Number(row.investorAvailableUnfundedCommitments ?? 0);
  sums.capitalAccountBalance += Number(row.capitalAccountBalance ?? 0);
  sums.recallable += Number(row.recallableDistributions ?? 0);
}

/** Base ledger metrics, and the human-readable label for each. */
export const SCENARIO_BASE_METRICS: ScenarioMetricKey[] = [
  'contributions',
  'distributions',
  'commitments',
  'unfunded',
  'capitalAccountBalance',
];

export const SCENARIO_METRIC_LABEL: Record<ScenarioMetricKey, string> = {
  contributions: 'Contributions',
  distributions: 'Distributions',
  commitments: 'Total Commitments',
  unfunded: 'Available Unfunded Commitments',
  capitalAccountBalance: 'Capital Account Balance',
};

const GROSS_FIELD: Record<ScenarioMetricKey, keyof BIRow> = {
  contributions: 'totalContributions',
  distributions: 'totalDistributions',
  commitments: 'investorTotalCommitments',
  unfunded: 'investorAvailableUnfundedCommitments',
  capitalAccountBalance: 'capitalAccountBalance',
};

function emptyGross(): ScenarioGross {
  return {
    contributions: { pos: 0, neg: 0 },
    distributions: { pos: 0, neg: 0 },
    commitments: { pos: 0, neg: 0 },
    unfunded: { pos: 0, neg: 0 },
    capitalAccountBalance: { pos: 0, neg: 0 },
  };
}

/** Accumulate each base metric's row value into its positive or negative side. */
function addGross(gross: ScenarioGross, row: BIRow): void {
  for (const key of SCENARIO_BASE_METRICS) {
    const value = Number(row[GROSS_FIELD[key]] ?? 0);
    if (value > 0) gross[key].pos += value;
    else if (value < 0) gross[key].neg += value;
  }
}

/**
 * True when a metric's lifetime net is ~0 but it has real positive AND negative
 * entries that cancel — i.e. the 0 is produced by offsetting entries, not by an
 * absence of activity. Arithmetic only; says nothing about why they offset.
 */
export function metricIsActiveNetZero(gross: GrossComponents | undefined): boolean {
  if (!gross) return false;
  const net = gross.pos + gross.neg;
  return Math.abs(net) <= MONEY_EPSILON && (gross.pos > MONEY_EPSILON || -gross.neg > MONEY_EPSILON);
}

/** Derive the full metric set (composites verified 473/473 against the workbook). */
export function deriveScenarioMetrics(sums: MetricSums): InvestorScenarioMetrics {
  const { contributions, distributions, commitments, unfunded, capitalAccountBalance, recallable } = sums;
  const nonRecallable = distributions - recallable;
  const totalValue = capitalAccountBalance + distributions;
  const calledCapital = commitments - unfunded;
  const capitalAtWork = -calledCapital - distributions;
  const percentDeployed = Math.abs(commitments) > MONEY_EPSILON ? calledCapital / commitments : 0;
  return {
    contributions,
    distributions,
    commitments,
    unfunded,
    capitalAccountBalance,
    recallable,
    nonRecallable,
    totalValue,
    calledCapital,
    capitalAtWork,
    percentDeployed,
  };
}

type VisualClassification = { label: string; signs: SignToken[] };

/** The label + sign tuple for each visual. Label strings match the workbook. */
export function classifyMetrics(metrics: InvestorScenarioMetrics): Record<ScenarioVisualId, VisualClassification> {
  const c = moneySign(metrics.contributions);
  const d = moneySign(metrics.distributions);
  const m = moneySign(metrics.commitments);
  const u = moneySign(metrics.unfunded);
  const b = moneySign(metrics.capitalAccountBalance);
  const tv = moneySign(metrics.totalValue);
  const caw = moneySign(metrics.capitalAtWork);
  const pd = moneySign(metrics.percentDeployed);
  const nr = moneySign(metrics.nonRecallable);
  return {
    cashFlow: {
      label: `Contribution ${c} / Distribution ${d}`,
      signs: [c, d],
    },
    commitment: {
      label: `Total Commitments ${m} / Available Unfunded Commitments ${u}`,
      signs: [m, u],
    },
    ratio: {
      label: `Contribution ${c} / Distribution ${d} / Capital Account Balance ${b}`,
      signs: [c, d, b],
    },
    totalValue: {
      label: `Capital Account Balance ${b} / Distribution ${d} / Total Value ${tv}`,
      signs: [b, d, tv],
    },
    capitalAtWork: {
      label: `Capital At Work ${caw} / Commitments ${m} / % Deployed ${pd} / Non-Recallable Distributions ${nr}`,
      signs: [caw, m, pd, nr],
    },
  };
}

function emptyByVisual(): Record<ScenarioVisualId, ScenarioBucket[]> {
  return { cashFlow: [], commitment: [], ratio: [], totalValue: [], capitalAtWork: [] };
}

function emptyTimeline(): InvestorScenarioTimeline {
  return { cashFlow: [], commitment: [], ratio: [], totalValue: [], capitalAtWork: [] };
}

function addSums(target: MetricSums, src: MetricSums): void {
  target.contributions += src.contributions;
  target.distributions += src.distributions;
  target.commitments += src.commitments;
  target.unfunded += src.unfunded;
  target.capitalAccountBalance += src.capitalAccountBalance;
  target.recallable += src.recallable;
}

/** Sortable quarter key; undated rows (no year/quarter) sort first as -1. */
function quarterKey(year: number | null, quarter: number | null): number {
  if (year == null || quarter == null) return -1;
  return year * 4 + (quarter - 1);
}

/**
 * Build each investor-fund's scenario timeline: for every posting quarter, the
 * cumulative-through-quarter metrics are classified, then runs of an identical
 * label are collapsed into spans. The final span's cumulative equals the
 * investor's lifetime sum, so it matches the snapshot classification exactly.
 */
export function buildInvestorTimelines(rows: BIRow[]): Record<string, InvestorScenarioTimeline> {
  // investorKey -> quarterKey -> { label, sums for that quarter }
  const byInvestor = new Map<string, Map<number, { key: number; label: string; sums: MetricSums }>>();
  for (const row of rows) {
    let quarters = byInvestor.get(row.investorKey);
    if (!quarters) {
      quarters = new Map();
      byInvestor.set(row.investorKey, quarters);
    }
    const key = quarterKey(row.postingYear, row.postingQuarter);
    let agg = quarters.get(key);
    if (!agg) {
      agg = { key, label: row.postingQuarterLabel ?? 'No date', sums: emptySums() };
      quarters.set(key, agg);
    }
    addRow(agg.sums, row);
  }

  const result: Record<string, InvestorScenarioTimeline> = {};
  for (const [investorKey, quarters] of byInvestor) {
    const ordered = Array.from(quarters.values()).sort((a, b) => a.key - b.key);
    const cumulative = emptySums();
    const timeline = emptyTimeline();
    for (const quarter of ordered) {
      addSums(cumulative, quarter.sums);
      const classified = classifyMetrics(deriveScenarioMetrics(cumulative));
      for (const visualId of SCENARIO_VISUAL_IDS) {
        const { label, signs } = classified[visualId];
        const spans = timeline[visualId];
        const last = spans[spans.length - 1];
        if (last && last.label === label) {
          last.endQuarterLabel = quarter.label;
          last.endKey = quarter.key;
          last.quarterCount += 1;
        } else {
          spans.push({
            label,
            signs,
            startQuarterLabel: quarter.label,
            endQuarterLabel: quarter.label,
            startKey: quarter.key,
            endKey: quarter.key,
            quarterCount: 1,
            isCurrent: false,
          });
        }
      }
    }
    for (const visualId of SCENARIO_VISUAL_IDS) {
      const spans = timeline[visualId];
      if (spans.length) spans[spans.length - 1].isCurrent = true;
    }
    result[investorKey] = timeline;
  }
  return result;
}

/**
 * Classify every investor into a scenario per visual. Groups rows by
 * investorKey, sums the base metrics, derives composites, and buckets
 * investors by their per-visual label. Buckets are sorted by count desc.
 */
export function classifyInvestorScenarios(rows: BIRow[]): ScenarioModel {
  const sumsByInvestor = new Map<string, { sums: MetricSums; gross: ScenarioGross; rowCount: number; first: BIRow }>();
  for (const row of rows) {
    const existing = sumsByInvestor.get(row.investorKey);
    if (existing) {
      addRow(existing.sums, row);
      addGross(existing.gross, row);
      existing.rowCount += 1;
    } else {
      const sums = emptySums();
      const gross = emptyGross();
      addRow(sums, row);
      addGross(gross, row);
      sumsByInvestor.set(row.investorKey, { sums, gross, rowCount: 1, first: row });
    }
  }

  const recordByInvestor: Record<string, InvestorScenarioRecord> = {};
  const bucketIndex = emptyByVisual();
  const bucketByKey = new Map<string, ScenarioBucket>();

  for (const [investorKey, { sums, gross, rowCount, first }] of sumsByInvestor) {
    const metrics = deriveScenarioMetrics(sums);
    const classified = classifyMetrics(metrics);
    const labels = {} as Record<ScenarioVisualId, string>;
    const signs = {} as Record<ScenarioVisualId, SignToken[]>;
    for (const visualId of SCENARIO_VISUAL_IDS) {
      const { label, signs: visualSigns } = classified[visualId];
      labels[visualId] = label;
      signs[visualId] = visualSigns;
      const bucketId = `${visualId}::${label}`;
      let bucket = bucketByKey.get(bucketId);
      if (!bucket) {
        bucket = { visualId, id: bucketId, label, signs: visualSigns, investorKeys: [], count: 0 };
        bucketByKey.set(bucketId, bucket);
        bucketIndex[visualId].push(bucket);
      }
      bucket.investorKeys.push(investorKey);
      bucket.count += 1;
    }
    recordByInvestor[investorKey] = {
      investorKey,
      shortCode: first.investorShortCode,
      portalName: first.investorPortalDisplayName ?? first.investorGroupName,
      // In RRE exports the partnership is carried in Company Name; investorKey
      // already collapses to one group per investor-fund.
      fund: first.companyName ?? first.investorGroupName,
      rowCount,
      metrics,
      labels,
      signs,
      gross,
    };
  }

  for (const visualId of SCENARIO_VISUAL_IDS) {
    bucketIndex[visualId].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  const timelineByInvestor = buildInvestorTimelines(rows);

  return { byVisual: bucketIndex, recordByInvestor, timelineByInvestor };
}

/**
 * Recompute scenario buckets for one visual over a subset of investors (e.g.
 * the currently-filtered population), preserving label + sign tuple. Sorted by
 * count descending.
 */
export function scenarioBucketsForInvestors(
  model: ScenarioModel,
  visualId: ScenarioVisualId,
  investorKeys: Iterable<string>,
): ScenarioBucket[] {
  const byId = new Map<string, ScenarioBucket>();
  for (const key of investorKeys) {
    const record = model.recordByInvestor[key];
    if (!record) continue;
    const label = record.labels[visualId];
    const id = `${visualId}::${label}`;
    let bucket = byId.get(id);
    if (!bucket) {
      bucket = { visualId, id, label, signs: record.signs[visualId], investorKeys: [], count: 0 };
      byId.set(id, bucket);
    }
    bucket.investorKeys.push(key);
    bucket.count += 1;
  }
  return Array.from(byId.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * Buckets for one visual counting every investor that was EVER in each scenario
 * across the life of the fund (from the timeline), not just their latest state.
 * An investor can appear in several buckets, so counts overlap and need not sum
 * to the population size — that is the point of the "ever in" lens.
 */
export function scenarioEverBucketsForInvestors(
  timelineByInvestor: Record<string, InvestorScenarioTimeline>,
  visualId: ScenarioVisualId,
  investorKeys: Iterable<string>,
): ScenarioBucket[] {
  const byId = new Map<string, ScenarioBucket>();
  for (const key of investorKeys) {
    const timeline = timelineByInvestor[key];
    if (!timeline) continue;
    const seen = new Set<string>();
    for (const span of timeline[visualId]) {
      if (seen.has(span.label)) continue; // count each scenario at most once per investor
      seen.add(span.label);
      const id = `${visualId}::${span.label}`;
      let bucket = byId.get(id);
      if (!bucket) {
        bucket = { visualId, id, label: span.label, signs: span.signs, investorKeys: [], count: 0 };
        byId.set(id, bucket);
      }
      bucket.investorKeys.push(key);
      bucket.count += 1;
    }
  }
  return Array.from(byId.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** The spans (active periods) during which an investor held a given scenario label. */
export function spansForScenario(
  timeline: InvestorScenarioTimeline | undefined,
  visualId: ScenarioVisualId,
  label: string,
): ScenarioSpan[] {
  if (!timeline) return [];
  return timeline[visualId].filter((span) => span.label === label);
}

/** Flat `{ "${visualId}::${label}": investorKey[] }` map for the filter cascade. */
export function scenarioInvestorsByBucketId(model: ScenarioModel): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const visualId of SCENARIO_VISUAL_IDS) {
    for (const bucket of model.byVisual[visualId]) {
      result[bucket.id] = bucket.investorKeys;
    }
  }
  return result;
}
