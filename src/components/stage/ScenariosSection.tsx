import { Download } from 'lucide-react';
import type {
  GrossComponents,
  InvestorScenarioRecord,
  InvestorScenarioTimeline,
  ScenarioBucket,
  ScenarioSpan,
  ScenarioVisualId,
} from '../../types';
import { formatCurrency } from '../../utils/format';
import { SCENARIO_VISUALS, metricIsActiveNetZero, spansForScenario } from '../../utils/scenarioClassifier';
import { Button } from '../common';
import { ScenarioLabel } from './ScenarioLabel';

export type ScenarioLens = 'latest' | 'ever';

/** "2014 Q1 – 2023 Q4", or a single quarter when the span is one period. */
function spanRange(span: ScenarioSpan): string {
  return span.startQuarterLabel === span.endQuarterLabel
    ? span.startQuarterLabel
    : `${span.startQuarterLabel} – ${span.endQuarterLabel}`;
}

/**
 * A numeric cell that, when its value is a 0 produced by offsetting entries,
 * flags it (†) and explains the gross +/− on hover — so a literal "$0" is never
 * mistaken for "no activity". Derived columns pass no `gross` and render plain.
 */
function MetricCell({ value, gross }: { value: number; gross?: GrossComponents }) {
  if (!metricIsActiveNetZero(gross)) return <td className="num">{formatCurrency(value)}</td>;
  return (
    <td
      className="num membership-table__netzero"
      title={`Net $0 — offsetting entries: +${formatCurrency(gross!.pos)} / ${formatCurrency(gross!.neg)}`}
    >
      {formatCurrency(value)}
      <sup className="membership-table__netzero-mark" aria-hidden="true">†</sup>
    </td>
  );
}

export type ScenariosSectionProps = {
  focusVisual: ScenarioVisualId;
  /** Scenario buckets for the focused visual, over the filtered population. */
  buckets: ScenarioBucket[];
  totalInvestors: number;
  selectedScenarioId: string;
  /** Members of the selected scenario. */
  members: InvestorScenarioRecord[];
  selectedInvestorKey: string | null;
  /** "latest" = current snapshot; "ever" = every scenario an investor passed through. */
  lens: ScenarioLens;
  /** Per-investor timelines, used in "ever" mode to show when a scenario was active. */
  timelines?: Record<string, InvestorScenarioTimeline>;
  onSelectVisual: (visualId: ScenarioVisualId) => void;
  onSelectScenario: (bucket: ScenarioBucket) => void;
  onFocusInvestor: (investorKey: string) => void;
  onChangeLens: (lens: ScenarioLens) => void;
  onExportMembers: () => void;
};

/**
 * The scenario directory: pick a visual, see every scenario in it with its
 * investor count, select one, and read off exactly who is in it. This is the
 * cross-investor view — distinct from the single-investor profile.
 */
export function ScenariosSection({
  focusVisual,
  buckets,
  totalInvestors,
  selectedScenarioId,
  members,
  selectedInvestorKey,
  lens,
  timelines,
  onSelectVisual,
  onSelectScenario,
  onFocusInvestor,
  onChangeLens,
  onExportMembers,
}: ScenariosSectionProps) {
  const maxCount = buckets.reduce((max, bucket) => Math.max(max, bucket.count), 0);
  const selected = buckets.find((bucket) => bucket.id === selectedScenarioId) ?? null;
  const visualTitle = SCENARIO_VISUALS.find((visual) => visual.id === focusVisual)?.title ?? focusVisual;
  const everMode = lens === 'ever';

  return (
    <section className="scenarios-section" aria-label="Scenario directory">
      <header className="scenarios-section__head">
        <div className="scenarios-section__heading">
          <h1 className="scenarios-section__title">Scenarios</h1>
          <span className="scenarios-section__sub">{totalInvestors.toLocaleString()} investors · {visualTitle}</span>
          <div className="scenarios-section__lens" role="group" aria-label="Membership lens">
            <button
              type="button"
              className="scenarios-section__lens-btn"
              data-active={!everMode ? 'true' : undefined}
              aria-pressed={!everMode}
              title="Classify each investor by its latest (current) state"
              onClick={() => onChangeLens('latest')}
            >
              As of latest
            </button>
            <button
              type="button"
              className="scenarios-section__lens-btn"
              data-active={everMode ? 'true' : undefined}
              aria-pressed={everMode}
              title="Count every scenario an investor passed through over the life of the fund"
              onClick={() => onChangeLens('ever')}
            >
              Ever in
            </button>
          </div>
        </div>
        <div className="scenarios-section__visuals" role="tablist" aria-label="Visual">
          {SCENARIO_VISUALS.map((visual) => (
            <button
              key={visual.id}
              type="button"
              role="tab"
              aria-selected={visual.id === focusVisual}
              className="scenarios-section__visual"
              data-active={visual.id === focusVisual ? 'true' : undefined}
              onClick={() => onSelectVisual(visual.id)}
            >
              {visual.title}
            </button>
          ))}
        </div>
      </header>

      <p className="scenarios-section__legend">
        Signs are raw ledger values — <b>Contribution −</b> means capital was paid in, <b>Distribution +</b> means cash was returned. A <b>$0</b> marked <b>†</b> is not absent data — positive and negative entries net to zero (hover for the gross).
        {everMode
          ? ' “Ever in” counts every scenario an investor held at any point, so an investor can appear in several and the counts overlap.'
          : ' “As of latest” shows each investor’s current state, so the counts partition the population.'}
      </p>

      <div className="scenarios-section__cards" role="list" aria-label={`${visualTitle} scenarios`}>
        {buckets.length === 0 ? (
          <p className="scenarios-section__empty">No investors in the current filter.</p>
        ) : (
          buckets.map((bucket) => {
            const active = bucket.id === selectedScenarioId;
            const pct = totalInvestors ? Math.round((bucket.count / totalInvestors) * 100) : 0;
            return (
              <button
                key={bucket.id}
                type="button"
                role="listitem"
                className="scenario-card"
                data-active={active ? 'true' : undefined}
                aria-pressed={active}
                onClick={() => onSelectScenario(bucket)}
              >
                <ScenarioLabel className="scenario-card__label" label={bucket.label} />
                <span className="scenario-card__meta">
                  <span className="scenario-card__count">{bucket.count.toLocaleString()}</span>
                  <span className="scenario-card__pct">{pct}%</span>
                </span>
                <span className="scenario-card__bar" aria-hidden="true">
                  <span className="scenario-card__bar-fill" style={{ width: `${maxCount ? (bucket.count / maxCount) * 100 : 0}%` }} />
                </span>
              </button>
            );
          })
        )}
      </div>

      <div className="scenarios-section__members">
        <header className="scenarios-section__members-head">
          <h2 className="scenarios-section__members-title">
            {selected ? selected.label : 'Investors'}
          </h2>
          <span className="scenarios-section__members-count">
            {selected ? `${members.length.toLocaleString()} investor${members.length === 1 ? '' : 's'}` : ''}
          </span>
          <Button
            className="scenarios-section__export"
            variant="text"
            leadingIcon={<Download size={13} />}
            disabled={!members.length}
            title="Export these investors as CSV"
            onClick={onExportMembers}
          >
            Export
          </Button>
        </header>
        {!selected ? (
          <p className="scenarios-section__empty">Select a scenario above to list the investors in it.</p>
        ) : members.length === 0 ? (
          <p className="scenarios-section__empty">No investors in this scenario.</p>
        ) : (
          <div className="scenarios-section__table-wrap">
            <table className="membership-table">
              <thead>
                <tr>
                  <th>Short code</th>
                  <th>Investor</th>
                  <th>Fund</th>
                  {everMode && <th>When in scenario</th>}
                  <th className="num">Contributions</th>
                  <th className="num">Distributions</th>
                  <th className="num">Commitments</th>
                  <th className="num">Capital Account</th>
                  <th className="num">Total Value</th>
                </tr>
              </thead>
              <tbody>
                {members.map((record) => {
                  const activeSpans = everMode && selected
                    ? spansForScenario(timelines?.[record.investorKey], focusVisual, selected.label)
                    : [];
                  const isCurrentHere = activeSpans.some((span) => span.isCurrent);
                  return (
                    <tr
                      key={record.investorKey}
                      data-selected={record.investorKey === selectedInvestorKey ? 'true' : undefined}
                      onClick={() => onFocusInvestor(record.investorKey)}
                      title="Open this investor's profile"
                    >
                      <td className="membership-table__code">{record.shortCode ?? '—'}</td>
                      <td>{record.portalName ?? '—'}</td>
                      <td>{record.fund ?? '—'}</td>
                      {everMode && (
                        <td className="membership-table__when">
                          {activeSpans.length ? activeSpans.map(spanRange).join(', ') : '—'}
                          {isCurrentHere && <span className="membership-table__when-now">now</span>}
                        </td>
                      )}
                      <MetricCell value={record.metrics.contributions} gross={record.gross?.contributions} />
                      <MetricCell value={record.metrics.distributions} gross={record.gross?.distributions} />
                      <MetricCell value={record.metrics.commitments} gross={record.gross?.commitments} />
                      <MetricCell value={record.metrics.capitalAccountBalance} gross={record.gross?.capitalAccountBalance} />
                      <td className="num">{formatCurrency(record.metrics.totalValue)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
