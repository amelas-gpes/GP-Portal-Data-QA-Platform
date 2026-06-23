import type { ReactNode } from 'react';
import type { SimConfig } from '../../App';
import type { ChartSide } from '../../data/chartRegistry';
import { SourceValuesPanel } from '../drawer/SourceValuesPanel';

export type WhatIfPanelProps = {
  side: ChartSide;
  sim: SimConfig | null;
  simArmed: boolean;
  periodOptions: string[];
  /** Optional readout of how the focused investor's scenarios shift under the what-if. */
  scenarioShift?: ReactNode;
  onSimChange: (sim: SimConfig) => void;
  onClearSim: () => void;
};

/**
 * The what-if surface as dockable content. Same source-value grid that used to
 * live in the right drawer — now it can be docked to the right or bottom edge.
 */
export function WhatIfPanel({ side, sim, simArmed, periodOptions, scenarioShift, onSimChange, onClearSim }: WhatIfPanelProps) {
  return (
    <div className="whatif-panel">
      {scenarioShift ? <div className="whatif-panel__shift">{scenarioShift}</div> : null}
      <SourceValuesPanel
        side={side}
        sim={sim}
        simArmed={simArmed}
        periodOptions={periodOptions}
        onSimChange={onSimChange}
        onClearSim={onClearSim}
      />
    </div>
  );
}
