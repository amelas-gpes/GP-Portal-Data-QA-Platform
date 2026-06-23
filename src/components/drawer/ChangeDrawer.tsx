import { X } from 'lucide-react';
import type { SimConfig } from '../../App';
import type { ChartSide } from '../../data/chartRegistry';
import { IconButton } from '../common';
import { SourceValuesPanel } from './SourceValuesPanel';

export type ChangeDrawerProps = {
  open: boolean;
  side: ChartSide;
  sim: SimConfig | null;
  simArmed: boolean;
  periodOptions: string[];
  /** Optional readout of how the focused investor's scenarios shift under the what-if. */
  scenarioShift?: React.ReactNode;
  onSimChange: (sim: SimConfig) => void;
  onClearSim: () => void;
  onClose: () => void;
};

/**
 * Right-docked 400px what-if surface. App renders it permanently; visibility is
 * CSS-driven via data-open so the source-value grid survives close. The user
 * flips a metric's sign / zeroes it / sets a value and watches the charts — and
 * each investor's scenario classification — move.
 */
export function ChangeDrawer({
  open,
  side,
  sim,
  simArmed,
  periodOptions,
  scenarioShift,
  onSimChange,
  onClearSim,
  onClose,
}: ChangeDrawerProps) {
  return (
    <aside
      className="change-drawer"
      data-open={open ? 'true' : 'false'}
      aria-label="Change data"
      aria-hidden={open ? undefined : true}
      inert={!open}
    >
      <header className="change-drawer__header">
        <h2 className="change-drawer__title">
          Change data
          {simArmed ? <span className="change-drawer__dirty-dot" role="img" aria-label="What-if armed" /> : null}
        </h2>
        <IconButton className="change-drawer__close" label="Close change drawer" variant="text" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </header>

      <div className="change-drawer__body">
        {scenarioShift ? <div className="change-drawer__scenario-shift">{scenarioShift}</div> : null}
        <div className="change-drawer__panel" data-segment="source">
          <SourceValuesPanel
            side={side}
            sim={sim}
            simArmed={simArmed}
            periodOptions={periodOptions}
            onSimChange={onSimChange}
            onClearSim={onClearSim}
          />
        </div>
      </div>
    </aside>
  );
}
