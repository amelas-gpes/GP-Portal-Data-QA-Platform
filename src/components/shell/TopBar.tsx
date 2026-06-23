import { Download, FileSpreadsheet, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cascadeSelectOptions } from '../../utils/investorFilters';
import { Button, Pill } from '../common';
import type {
  DashboardFilters,
  FilterOptions,
  GroupingMode,
  ImportSummary,
  ValidationSeverity,
} from '../../types';

// TopBar — the sticky shell bar. Brand, SessionChip (import recap popover),
// a single Filters control, investorQuery kill-switch chip, what-if indicator,
// Export (scenario membership) / Replace, palette hint.

export type TopBarProps = {
  summary: ImportSummary | null;
  fileName: string | null;
  filters: DashboardFilters;
  filterOptions: FilterOptions | null;
  investorQuery: string;
  openFilterId: string | null;
  simArmed: boolean;
  /** True when any metric's draft formula differs from production — charts show draft logic. */
  logicDraftActive: boolean;
  isImporting: boolean;
  onFiltersChange: (next: DashboardFilters) => void;
  onOpenFilter: (filterId: string | null) => void;
  onClearQuery: () => void;
  onExport: () => void;
  onReplace: () => void;
  onOpenPalette: () => void;
  onClearSim: () => void;
  /** Restore every metric to its production formula. */
  onResetLogic: () => void;
  /** Panel toggles (navigator / bottom / right) rendered in the right actions. */
  panelControls?: ReactNode;
};

type SelectFilterId = 'investorType' | 'investorGroupName' | 'companyGroupCode' | 'companyName' | 'fundCurrencyCode';

type SelectFilterDef = {
  id: SelectFilterId;
  label: string;
  optionsKey: 'investorTypes' | 'investorGroups' | 'companyGroupCodes' | 'companyNames' | 'fundCurrencyCodes';
};

const SELECT_FILTERS: readonly SelectFilterDef[] = [
  { id: 'investorType', label: 'Investor Type', optionsKey: 'investorTypes' },
  { id: 'investorGroupName', label: 'Investor Group', optionsKey: 'investorGroups' },
  { id: 'companyGroupCode', label: 'Group Code', optionsKey: 'companyGroupCodes' },
  { id: 'companyName', label: 'Company', optionsKey: 'companyNames' },
  { id: 'fundCurrencyCode', label: 'Currency', optionsKey: 'fundCurrencyCodes' },
];

const GROUPING_LABELS: Record<GroupingMode, string> = {
  investorFundPairing: 'Investor–Fund',
  groupCode: 'Group code',
  investorCode: 'Investor code',
};

const GROUPING_ORDER: readonly GroupingMode[] = ['investorFundPairing', 'groupCode', 'investorCode'];

const SEVERITY_TONE: Record<ValidationSeverity, 'good' | 'warn' | 'bad'> = {
  ok: 'good',
  warning: 'warn',
  error: 'bad',
};

function useDismissOnOutside<T extends HTMLElement>(open: boolean, onDismiss: () => void, withEscape = false) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const node = ref.current;
      if (node && event.target instanceof Node && !node.contains(event.target)) onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    document.addEventListener('pointerdown', onPointerDown);
    if (withEscape) document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      if (withEscape) document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onDismiss, withEscape]);
  return ref;
}

function describeActiveFilters(
  filters: DashboardFilters,
  maxDate: string | null,
): string[] {
  const entries: string[] = [];
  for (const def of SELECT_FILTERS) {
    const value = filters[def.id];
    if (value) entries.push(`${def.label}: ${value}`);
  }
  if (filters.endDate && filters.endDate !== (maxDate ?? filters.endDate)) entries.push(`End date: ${filters.endDate}`);
  if (!filters.cumulative) entries.push('View: Per-period');
  if (filters.groupingMode !== 'investorFundPairing') entries.push(`Grouping: ${GROUPING_LABELS[filters.groupingMode]}`);
  return entries;
}

export function TopBar({
  summary,
  fileName,
  filters,
  filterOptions,
  investorQuery,
  openFilterId,
  simArmed,
  logicDraftActive,
  isImporting,
  onFiltersChange,
  onOpenFilter,
  onClearQuery,
  onExport,
  onReplace,
  onOpenPalette,
  onClearSim,
  onResetLogic,
  panelControls,
}: TopBarProps) {
  const [sessionOpen, setSessionOpen] = useState(false);
  const closeSession = useCallback(() => setSessionOpen(false), []);
  const sessionRef = useDismissOnOutside<HTMLDivElement>(sessionOpen, closeSession, true);

  const patchFilters = (patch: Partial<DashboardFilters>) => onFiltersChange({ ...filters, ...patch });
  const setSelectFilter = (id: SelectFilterId, value: string) => {
    const next = { ...filters };
    next[id] = value;
    onFiltersChange(next);
  };

  const sessionLabel = summary
    ? `${fileName ?? summary.fileName} · ${summary.totalRows.toLocaleString()} rows · ${summary.investorCount.toLocaleString()} investors`
    : fileName ?? 'No workbook';

  const cascadedOptions = useMemo(() => {
    if (!summary) return null;
    // Scenario is not a dataset filter, so the facet cascade ignores it.
    return cascadeSelectOptions(summary.investorOptions, { ...filters, scenarioId: '' }, investorQuery, summary.scenarioInvestorsById ?? {});
  }, [filters, investorQuery, summary]);

  const filtersOpen = openFilterId !== null;
  const closeFilters = useCallback(() => onOpenFilter(null), [onOpenFilter]);
  const filtersRef = useDismissOnOutside<HTMLDivElement>(filtersOpen, closeFilters);
  const activeFilters = describeActiveFilters(filters, filterOptions?.maxDate ?? null);
  const resetFilters = () =>
    onFiltersChange({
      ...filters,
      investorType: '',
      investorGroupName: '',
      companyGroupCode: '',
      companyName: '',
      fundCurrencyCode: '',
      endDate: filterOptions?.maxDate ?? '',
      scenarioId: '',
      cumulative: true,
      groupingMode: 'investorFundPairing',
    });

  const paletteHint = useMemo(
    () => (typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl+K'),
    [],
  );

  return (
    <header className="top-bar" data-mode={simArmed ? 'SIM' : 'PROD'}>
      <div className="top-bar__brand">
        <span className="top-bar__brand-glyph" aria-hidden="true">GP</span>
        <span className="top-bar__brand-name">GP Portal Scenarios</span>
      </div>

      <div className="top-bar__session" ref={sessionRef}>
        <button
          type="button"
          className="top-bar__session-chip"
          aria-expanded={sessionOpen}
          aria-haspopup="dialog"
          title="Import validation recap"
          onClick={() => setSessionOpen((open) => !open)}
        >
          {sessionLabel}
        </button>
        {sessionOpen && summary ? (
          <div className="top-bar__session-popover" role="dialog" aria-label="Import validation recap">
            <header className="top-bar__session-popover-header">
              <strong>{summary.fileName}</strong>
              <Pill tone={SEVERITY_TONE[summary.validation.severity]}>{summary.validation.severity}</Pill>
            </header>
            <dl className="top-bar__session-popover-facts">
              <div className="top-bar__session-fact"><dt>Missing columns</dt><dd>{summary.validation.missingColumns.length.toLocaleString()}</dd></div>
              <div className="top-bar__session-fact"><dt>Duplicate columns</dt><dd>{summary.validation.duplicateColumns.length.toLocaleString()}</dd></div>
              <div className="top-bar__session-fact"><dt>Type issue groups</dt><dd>{summary.validation.typeIssueGroups.length.toLocaleString()}</dd></div>
              <div className="top-bar__session-fact"><dt>Row reconciliation</dt><dd>{summary.validation.rowCountReconciliation.message}</dd></div>
              <div className="top-bar__session-fact"><dt>Import time</dt><dd>{summary.validation.timing.totalMs.toLocaleString()} ms</dd></div>
            </dl>
          </div>
        ) : null}
      </div>

      <div className="top-bar__filters" role="group" aria-label="Dataset filters">
        <div className="top-bar__chip-wrap" data-open={filtersOpen ? 'true' : undefined} ref={filtersRef}>
          <button
            type="button"
            className="top-bar__chip top-bar__chip--filters"
            data-active={activeFilters.length ? 'true' : undefined}
            aria-expanded={filtersOpen}
            aria-haspopup="dialog"
            title={activeFilters.length ? `Narrowing — ${activeFilters.join(' · ')}. Click to change.` : 'Filter the dataset: investor type, group, company, currency, end date, view, grouping.'}
            onClick={() => onOpenFilter(filtersOpen ? null : 'filters')}
          >
            <SlidersHorizontal size={13} aria-hidden="true" />
            Filters
            {activeFilters.length ? <span className="top-bar__chip-count">{activeFilters.length}</span> : null}
          </button>
          {filtersOpen ? (
            <div className="top-bar__filter-popover top-bar__filter-popover--all" role="dialog" aria-label="Dataset filters">
              {SELECT_FILTERS.map((def) => (
                <label className="top-bar__filter-field" key={def.id}>
                  <span>{def.label}</span>
                  <select value={filters[def.id]} onChange={(event) => setSelectFilter(def.id, event.target.value)}>
                    <option value="">All</option>
                    {cascadedOptions
                      ? cascadedOptions[def.id].map((option) => (
                          <option key={option.value} value={option.value}>{option.value} ({option.count.toLocaleString()})</option>
                        ))
                      : (filterOptions?.[def.optionsKey] ?? []).map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                  </select>
                </label>
              ))}

              <label className="top-bar__filter-field">
                <span>End date</span>
                <input type="date" value={filters.endDate} max={filterOptions?.maxDate ?? undefined} onChange={(event) => patchFilters({ endDate: event.target.value })} />
              </label>

              <div className="top-bar__filter-field">
                <span>View</span>
                <div className="top-bar__filter-toggle" role="group" aria-label="Cumulative or per-period view">
                  <button type="button" aria-pressed={filters.cumulative} data-active={filters.cumulative ? 'true' : undefined} onClick={() => patchFilters({ cumulative: true })}>Cumulative</button>
                  <button type="button" aria-pressed={!filters.cumulative} data-active={!filters.cumulative ? 'true' : undefined} onClick={() => patchFilters({ cumulative: false })}>Per-period</button>
                </div>
              </div>

              <div className="top-bar__filter-field">
                <span>Grouping</span>
                <div className="top-bar__filter-toggle" role="group" aria-label="Grouping mode">
                  {GROUPING_ORDER.map((grouping) => (
                    <button key={grouping} type="button" aria-pressed={filters.groupingMode === grouping} data-active={filters.groupingMode === grouping ? 'true' : undefined} onClick={() => patchFilters({ groupingMode: grouping })}>
                      {GROUPING_LABELS[grouping]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="top-bar__filter-popover-actions">
                <Button variant="text" onClick={resetFilters}>Clear all</Button>
                <Button variant="primary" onClick={() => onOpenFilter(null)}>Done</Button>
              </div>
            </div>
          ) : null}
        </div>

        {investorQuery ? (
          <button
            type="button"
            className="top-bar__chip top-bar__chip--query"
            data-active="true"
            title="The investor search is narrowing the list. Click to clear it."
            onClick={onClearQuery}
          >
            {`Search: "${investorQuery}" ✕`}
          </button>
        ) : null}
      </div>

      {simArmed ? (
        <button type="button" className="top-bar__mode-chip" data-mode="SIM" data-armed="true" title="A what-if is changing the data. Click to clear it." onClick={onClearSim}>
          What-if ✕
        </button>
      ) : null}

      {logicDraftActive ? (
        <button type="button" className="top-bar__mode-chip" data-mode="DRAFT" data-armed="true" title="The charts are showing draft logic. Click to reset every metric to its production formula." onClick={onResetLogic}>
          Draft logic ✕
        </button>
      ) : null}

      <div className="top-bar__actions">
        {panelControls}
        <Button
          className="top-bar__action"
          leadingIcon={<Download size={14} aria-hidden="true" />}
          disabled={isImporting}
          title={isImporting ? 'Import in progress — export is unavailable.' : 'Export the scenario membership (every investor\'s scenario per visual) as CSV.'}
          onClick={onExport}
        >
          Export scenarios
        </Button>
        <Button
          className="top-bar__action"
          leadingIcon={<FileSpreadsheet size={14} aria-hidden="true" />}
          disabled={isImporting}
          title={isImporting ? 'Import in progress.' : 'Replace the workbook with a new import.'}
          onClick={onReplace}
        >
          Replace
        </Button>
        <Button className="top-bar__palette-hint" variant="text" title={`Open the command palette (${paletteHint}).`} onClick={onOpenPalette}>
          {paletteHint}
        </Button>
      </div>
    </header>
  );
}
