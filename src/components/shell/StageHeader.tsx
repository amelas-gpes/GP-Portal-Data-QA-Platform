import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton, Pill } from '../common';
import type { InvestorOption, InvestorVisualMode } from '../../types';

// StageHeader — the 56px sticky identity bar under the TopBar. Investor identity
// (serif name, mono meta line, scenario tag for the focused visual), steppers,
// LP/GP and Combined/Individual segments.

export type StageHeaderProps = {
  investors: InvestorOption[];
  viewMode: InvestorVisualMode;
  side: 'lp' | 'gp';
  position: { index: number; total: number };
  computePending: boolean;
  /** The selected investor's scenario label for the focused visual (single selection). */
  scenarioLabel?: string | null;
  scenarioVisualTitle?: string;
  onStep: (delta: -1 | 1) => void;
  onSideChange: (side: 'lp' | 'gp') => void;
  onViewModeChange: (viewMode: InvestorVisualMode) => void;
};

export function StageHeader({
  investors,
  viewMode,
  side,
  position,
  computePending,
  scenarioLabel,
  scenarioVisualTitle,
  onStep,
  onSideChange,
  onViewModeChange,
}: StageHeaderProps) {
  const single = investors.length === 1 ? investors[0] : null;
  const name = single
    ? single.investorPortalDisplayName ?? single.investorGroupName ?? single.label
    : investors.length > 1
      ? `${investors.length.toLocaleString()} investors · ${viewMode === 'combined' ? 'Combined' : 'Individual'}`
      : 'No investor selected';

  const metaLine = single
    ? [
        single.investorType,
        single.fundCurrencyCode,
        `${single.rowCount.toLocaleString()} rows`,
        single.companyName,
        position.index >= 0 ? `#${position.index + 1} of ${position.total.toLocaleString()}` : null,
      ].filter(Boolean).join(' · ')
    : null;

  return (
    <section className="stage-header" data-side={side}>
      <div className="stage-header__identity">
        <h1 className="stage-header__name">{name}</h1>
        {metaLine ? <span className="stage-header__meta">{metaLine}</span> : null}
        {single && position.index < 0 ? (
          <Pill
            className="stage-header__filtered-out"
            tone="warn"
            title="The active filters or search exclude this investor from the list. Charts honor those filters, so values can read as zero."
          >
            Filtered out
          </Pill>
        ) : null}
        {single && side === 'lp' && scenarioLabel ? (
          <Pill
            className="stage-header__scenario"
            tone="neutral"
            title={`${scenarioVisualTitle ?? 'Scenario'} classification for this investor`}
          >
            {scenarioVisualTitle ? `${scenarioVisualTitle}: ` : ''}{scenarioLabel}
          </Pill>
        ) : null}
      </div>

      <div className="stage-header__steppers">
        <IconButton label="Previous investor" title="Previous investor (k or ←)" onClick={() => onStep(-1)}>
          <ChevronLeft size={16} aria-hidden="true" />
        </IconButton>
        <span className="stage-header__position" aria-label="List position">
          {position.index >= 0 ? (position.index + 1).toLocaleString() : '—'} / {position.total.toLocaleString()}
        </span>
        <IconButton label="Next investor" title="Next investor (j or →)" onClick={() => onStep(1)}>
          <ChevronRight size={16} aria-hidden="true" />
        </IconButton>
      </div>

      <div className="stage-header__segmented stage-header__segmented--side" role="group" aria-label="LP or GP side">
        <button
          type="button"
          aria-pressed={side === 'lp'}
          data-active={side === 'lp' ? 'true' : undefined}
          title="Limited partner visuals — scenarios live here (g flips side)"
          onClick={() => onSideChange('lp')}
        >
          LP
        </button>
        <button
          type="button"
          aria-pressed={side === 'gp'}
          data-active={side === 'gp' ? 'true' : undefined}
          title="General partner / program visuals (g flips side)"
          onClick={() => onSideChange('gp')}
        >
          GP
        </button>
      </div>

      {investors.length > 1 ? (
        <div className="stage-header__segmented stage-header__segmented--view" role="group" aria-label="Combined or individual view">
          <button
            type="button"
            aria-pressed={viewMode === 'combined'}
            data-active={viewMode === 'combined' ? 'true' : undefined}
            title="One combined view across the selected investors"
            onClick={() => onViewModeChange('combined')}
          >
            Combined
          </button>
          <button
            type="button"
            aria-pressed={viewMode === 'individual'}
            data-active={viewMode === 'individual' ? 'true' : undefined}
            title="One view per selected investor"
            onClick={() => onViewModeChange('individual')}
          >
            Individual
          </button>
        </div>
      ) : null}

      <div className="stage-header__shimmer" data-active={computePending ? 'true' : undefined} aria-hidden="true" />
    </section>
  );
}
