import { RotateCcw } from 'lucide-react';
import type { SimConfig } from '../../App';
import type { ChartSide } from '../../data/chartRegistry';
import type { NumericKey } from '../../data/columns';
import {
  SCENARIO_POLARITY_OPTIONS,
  SCENARIO_REVIEW_PRESETS,
  SCENARIO_SIMULATION_METRICS,
  fieldDisplayName,
  type ScenarioPolarity,
} from '../../utils/scenarioSimulation';
import { Button } from '../common';

export type SourceValuesPanelProps = {
  side: ChartSide;
  sim: SimConfig | null;
  simArmed: boolean;
  /** Quarter labels available in the current bundle ('all' is added by the panel). */
  periodOptions: string[];
  onSimChange: (sim: SimConfig) => void;
  onClearSim: () => void;
};

const EMPTY_SIM: SimConfig = { overrides: {}, customValues: {}, periodKey: 'all', presetId: null };

/** Distinct source fields used by the LP simulation metrics, in first-use order. */
const SIMULATION_FIELDS: NumericKey[] = (() => {
  const seen = new Set<NumericKey>();
  const fields: NumericKey[] = [];
  for (const metric of SCENARIO_SIMULATION_METRICS) {
    for (const field of metric.sourceFields) {
      if (!seen.has(field)) {
        seen.add(field);
        fields.push(field);
      }
    }
  }
  return fields;
})();

const FIELD_USED_BY: ReadonlyMap<NumericKey, string[]> = (() => {
  const map = new Map<NumericKey, string[]>();
  for (const metric of SCENARIO_SIMULATION_METRICS) {
    for (const field of metric.sourceFields) {
      const label = `${metric.visualName}: ${metric.metricName}`;
      const list = map.get(field) ?? [];
      if (!list.includes(label)) list.push(label);
      map.set(field, list);
    }
  }
  return map;
})();

function usedByTitle(field: NumericKey): string {
  const usedBy = FIELD_USED_BY.get(field) ?? [];
  return usedBy.length ? `${fieldDisplayName(field)} feeds: ${usedBy.join('; ')}` : fieldDisplayName(field);
}

export function SourceValuesPanel({ side, sim, simArmed, periodOptions, onSimChange, onClearSim }: SourceValuesPanelProps) {
  const current = sim ?? EMPTY_SIM;
  const lpOnly = side === 'gp';
  const selectedPreset = current.presetId
    ? SCENARIO_REVIEW_PRESETS.find((preset) => preset.id === current.presetId) ?? null
    : null;

  const handlePreset = (presetId: string) => {
    if (!presetId) {
      onSimChange({ ...current, presetId: null });
      return;
    }
    const preset = SCENARIO_REVIEW_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    onSimChange({ ...current, overrides: { ...preset.overrides }, presetId: preset.id });
  };

  const handlePeriod = (periodKey: string) => {
    onSimChange({ ...current, periodKey });
  };

  const handlePolarity = (field: NumericKey, polarity: ScenarioPolarity) => {
    const overrides = { ...current.overrides };
    if (polarity === 'current') delete overrides[field];
    else overrides[field] = polarity;
    onSimChange({ ...current, overrides, presetId: null });
  };

  const handleCustomValue = (field: NumericKey, raw: string) => {
    const customValues = { ...current.customValues };
    if (raw.trim() === '') {
      if (!(field in customValues)) return;
      delete customValues[field];
    } else {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;
      customValues[field] = parsed;
    }
    onSimChange({ ...current, customValues, presetId: null });
  };

  return (
    <div className="source-values-panel" data-armed={simArmed ? 'true' : undefined} data-side={side}>
      {lpOnly ? (
        <div className="source-values-panel__notice" role="status" data-tone="warn">
          <strong>Simulation is LP-only</strong>
          <p>
            Source-value simulation rewrites the LP quarter series; GP visuals aggregate by program and are not
            covered. Switch to the LP side (press g) to arm a simulation — GP findings offer rows-only evidence
            instead.
          </p>
        </div>
      ) : null}

      <fieldset className="source-values-panel__scenario" disabled={lpOnly}>
        <legend className="source-values-panel__legend">Scenario</legend>
        <label className="source-values-panel__field">
          <span>Preset</span>
          <select
            className="source-values-panel__preset-select"
            value={current.presetId ?? ''}
            onChange={(event) => handlePreset(event.target.value)}
            title="Apply a curated review scenario; it sets the field polarities below."
          >
            <option value="">Custom — no preset</option>
            {SCENARIO_REVIEW_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id} title={preset.description}>
                {preset.name}
              </option>
            ))}
          </select>
        </label>
        {selectedPreset ? <p className="source-values-panel__preset-detail">{selectedPreset.description}</p> : null}
        <label className="source-values-panel__field">
          <span>Period</span>
          <select
            className="source-values-panel__period-select"
            value={current.periodKey}
            onChange={(event) => handlePeriod(event.target.value)}
            title="Limit the simulated rows to one posting quarter, or rewrite all periods."
          >
            <option value="all">All periods</option>
            {periodOptions.map((period) => (
              <option key={period} value={period}>
                {period}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset className="source-values-panel__fields" disabled={lpOnly}>
        <legend className="source-values-panel__legend">Source field polarities</legend>
        <div className="source-values-panel__grid" role="group" aria-label="Source field polarity grid">
          <div className="source-values-panel__grid-head" aria-hidden="true">
            <span>Field</span>
            <span>Polarity</span>
            <span>Exact value</span>
          </div>
          {SIMULATION_FIELDS.map((field) => {
            const polarity = current.overrides[field] ?? 'current';
            const customValue = current.customValues[field];
            const hasCustom = typeof customValue === 'number' && Number.isFinite(customValue);
            const label = fieldDisplayName(field);
            return (
              <div
                className="source-values-panel__row"
                key={field}
                data-active={polarity !== 'current' || hasCustom ? 'true' : undefined}
              >
                <span className="source-values-panel__row-label" title={usedByTitle(field)}>{label}</span>
                <select
                  className="source-values-panel__polarity"
                  value={polarity}
                  aria-label={`${label} polarity`}
                  onChange={(event) => handlePolarity(field, event.target.value as ScenarioPolarity)}
                  title={SCENARIO_POLARITY_OPTIONS.find((option) => option.id === polarity)?.title}
                >
                  {SCENARIO_POLARITY_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id} title={option.title}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  className="source-values-panel__custom"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  placeholder="Exact"
                  aria-label={`${label} custom exact value`}
                  value={hasCustom ? String(customValue) : ''}
                  onChange={(event) => handleCustomValue(field, event.target.value)}
                  title="Force this field to an exact value on the simulated rows. Leave blank to unset."
                />
              </div>
            );
          })}
        </div>
      </fieldset>

      <footer className="source-values-panel__footer">
        <Button
          variant="secondary"
          leadingIcon={<RotateCcw size={15} />}
          onClick={onClearSim}
          disabled={!sim}
          title="Remove every simulated override and value; charts return to the imported source data."
        >
          Clear simulation
        </Button>
        <p className="source-values-panel__status" role="status" data-tone={simArmed ? 'warn' : 'neutral'}>
          {simArmed
            ? 'Simulating — charts show amber ghosts vs baseline'
            : 'Set a polarity or value to simulate source changes on the live charts'}
        </p>
      </footer>
    </div>
  );
}
