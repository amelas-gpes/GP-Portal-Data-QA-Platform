import { ArrowUpRight, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { InvestorScenarioRecord, InvestorScenarioTimeline, ScenarioSpan, ScenarioVisualId } from '../../types';
import {
  SCENARIO_BASE_METRICS,
  SCENARIO_METRIC_LABEL,
  SCENARIO_VISUALS,
  metricIsActiveNetZero,
} from '../../utils/scenarioClassifier';
import { formatCurrency } from '../../utils/format';
import { ScenarioLabel, SignSignature } from './ScenarioLabel';

export type InvestorScenarioSummaryProps = {
  investorName: string;
  fund: string | null;
  record: InvestorScenarioRecord;
  /** This investor's cumulative scenario timeline per visual (across all time). */
  timeline?: InvestorScenarioTimeline;
  /** Scenario currently selected in the directory; matching spans are highlighted. */
  highlightScenarioId?: string;
  /** Jump to the scenario directory showing everyone in this scenario. */
  onViewAll: (scenarioId: string, visualId: ScenarioVisualId) => void;
};

/** Compact visual names for the collapsed fingerprint. */
const SHORT_TITLE: Record<ScenarioVisualId, string> = {
  cashFlow: 'Cash Flow',
  commitment: 'Commitment',
  ratio: 'Ratio',
  totalValue: 'Total Value',
  capitalAtWork: 'Capital',
};

/** "2014 Q1 – 2023 Q4", or a single quarter when the span is one period. */
function spanRange(span: ScenarioSpan): string {
  if (!span.startQuarterLabel) return '';
  return span.startQuarterLabel === span.endQuarterLabel
    ? span.startQuarterLabel
    : `${span.startQuarterLabel} – ${span.endQuarterLabel}`;
}

/**
 * The investor profile's scenario context — collapsed by default so the charts
 * stay the main event. Collapsed, it reads as a fingerprint: each visual's
 * current sign pattern at a glance. Expanded, it opens the full per-visual
 * timeline (every scenario this investor passed through, latest marked "now").
 */
export function InvestorScenarioSummary({
  investorName,
  fund,
  record,
  timeline,
  highlightScenarioId,
  onViewAll,
}: InvestorScenarioSummaryProps) {
  const [open, setOpen] = useState(false);
  const offsettingMetrics = SCENARIO_BASE_METRICS.filter((key) => metricIsActiveNetZero(record.gross?.[key]));

  return (
    <section className="investor-scenarios" data-open={open ? 'true' : undefined} aria-label={`Scenarios for ${investorName}`}>
      <button
        type="button"
        className="investor-scenarios__bar"
        aria-expanded={open}
        title={open ? 'Hide the scenario timeline' : 'Show the full scenario timeline'}
        onClick={() => setOpen((value) => !value)}
      >
        {open
          ? <ChevronDown size={15} className="investor-scenarios__chevron" aria-hidden="true" />
          : <ChevronRight size={15} className="investor-scenarios__chevron" aria-hidden="true" />}
        <span className="investor-scenarios__bar-title">Scenario profile</span>
        {!open && (
          <span className="investor-scenarios__fingerprint">
            {SCENARIO_VISUALS.map((visual) => (
              <span className="scn-chip" key={visual.id} title={`${visual.title}: ${record.labels[visual.id]}`}>
                <span className="scn-chip__name">{SHORT_TITLE[visual.id]}</span>
                <SignSignature signs={record.signs[visual.id]} />
              </span>
            ))}
          </span>
        )}
        <span className="investor-scenarios__bar-hint">{open ? 'Hide' : 'Timeline'}</span>
      </button>

      {open && (
        <div className="investor-scenarios__body">
          <span className="investor-scenarios__sub">{fund ? `${investorName} · ${fund}` : investorName}</span>
          <ul className="investor-scenarios__list">
            {SCENARIO_VISUALS.map((visual) => {
              // Prefer the full timeline; fall back to the single snapshot label.
              const spans: ScenarioSpan[] = timeline?.[visual.id]?.length
                ? timeline[visual.id]
                : [{
                    label: record.labels[visual.id],
                    signs: record.signs[visual.id],
                    startQuarterLabel: '',
                    endQuarterLabel: '',
                    startKey: 0,
                    endKey: 0,
                    quarterCount: 0,
                    isCurrent: true,
                  }];
              return (
                <li key={visual.id} className="investor-scenarios__visual-block">
                  <span className="investor-scenarios__visual">{visual.title}</span>
                  <ol className="investor-scenarios__timeline">
                    {spans.map((span, index) => {
                      const scenarioId = `${visual.id}::${span.label}`;
                      const range = spanRange(span);
                      return (
                        <li key={`${span.label}-${span.startKey}-${index}`}>
                          <button
                            type="button"
                            className="investor-scenarios__span"
                            data-current={span.isCurrent ? 'true' : undefined}
                            data-highlight={scenarioId === highlightScenarioId ? 'true' : undefined}
                            title={`See everyone in “${span.label}” for ${visual.title}`}
                            onClick={() => onViewAll(scenarioId, visual.id)}
                          >
                            {range && <span className="investor-scenarios__period">{range}</span>}
                            <ScenarioLabel className="investor-scenarios__label" label={span.label} />
                            {span.isCurrent && spans.length > 1 && (
                              <span className="investor-scenarios__now">now</span>
                            )}
                            <ArrowUpRight size={12} className="investor-scenarios__span-go" aria-hidden="true" />
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </li>
              );
            })}
          </ul>
          {offsettingMetrics.length > 0 && (
            <p className="investor-scenarios__note">
              Reads <b>0</b> where positive and negative entries net to zero:{' '}
              {offsettingMetrics.map((key, index) => {
                const gross = record.gross![key];
                return (
                  <span key={key} className="investor-scenarios__net">
                    {index > 0 ? ' · ' : ''}
                    {SCENARIO_METRIC_LABEL[key]} +{formatCurrency(gross.pos)} / {formatCurrency(gross.neg)}
                  </span>
                );
              })}
            </p>
          )}
          <p className="investor-scenarios__legend">
            Signs are raw ledger values — <b>Contribution −</b> means capital was paid in, <b>Distribution +</b> means cash was returned. Each row is the investor's scenario across time; <b>now</b> marks the latest state.
          </p>
        </div>
      )}
    </section>
  );
}
