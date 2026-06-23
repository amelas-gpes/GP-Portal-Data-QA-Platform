import { Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { BIRow, ChartBundle, RowFlags } from '../types';
import { EmptyState } from './common';
import { RawDataTable } from './RawDataTable';

type RawDataFlagFilter = keyof RowFlags | 'flagged' | null;

export type RawDataSeed = {
  /** Human-readable scope description rendered as a removable chip. */
  label: string;
  query?: string;
  flagFilter?: RawDataFlagFilter;
};

type RawDataFlagDefinition = {
  key: keyof RowFlags;
  label: string;
  explanation: string;
};

const rawDataFlagDefinitions: RawDataFlagDefinition[] = [
  {
    key: 'hasNegativeNAV',
    label: 'Negative NAV',
    explanation: 'NAV, capital account balance, or investments value is below zero.',
  },
  {
    key: 'hasNegativeUnfunded',
    label: 'Negative unfunded',
    explanation: 'Available unfunded commitments are below zero; confirm the signed balance is intended.',
  },
  {
    key: 'hasBlankCapCallDistWithValue',
    label: 'Blank CAPCALLDIST',
    explanation: 'The row has money movement, but the CAPCALLDIST Code cell is blank.',
  },
  {
    key: 'hasNonStandardCapCallDist',
    label: 'Non-standard code',
    explanation: 'The CAPCALLDIST Code has an unexpected character or shape.',
  },
  {
    key: 'hasMixedSigns',
    label: 'Mixed signs',
    explanation: 'Money fields on the same row include both positive and negative values.',
  },
  {
    key: 'hasPositiveContribution',
    label: 'Positive contribution',
    explanation: 'Actual Contributions is positive; confirm this is not a sign reversal.',
  },
  {
    key: 'hasNegativeDistribution',
    label: 'Negative distribution',
    explanation: 'Actual Distributions is negative; confirm this is not a sign reversal.',
  },
  {
    key: 'hasNegativeCarryPaid',
    label: 'Negative carry paid',
    explanation: 'Carry Paid is negative; confirm this signed carry activity is expected.',
  },
];

export function RawData({
  bundle,
  seed = null,
  onClearSeed,
  inline = false,
  scopeTitle,
}: {
  bundle: ChartBundle | null;
  seed?: RawDataSeed | null;
  onClearSeed?: () => void;
  /** Inline variant: chrome-free, fills its parent's height, and the table
   *  flexes to fill a resizable region (used under an expanded chart). */
  inline?: boolean;
  /** Scope heading shown in the inline variant in place of "Raw Data". */
  scopeTitle?: string;
}) {
  const [query, setQuery] = useState(seed?.query ?? '');
  const [activeFlagFilter, setActiveFlagFilter] = useState<RawDataFlagFilter>(seed?.flagFilter ?? null);

  // A seed pre-scopes the table from a hit or delta click. Sync it during render
  // (not in an effect) once per seed identity, so later manual edits stay
  // unconstrained; a null seed records identity without resetting the table.
  const [appliedSeed, setAppliedSeed] = useState(seed);
  if (seed !== appliedSeed) {
    setAppliedSeed(seed);
    if (seed) {
      setQuery(seed.query ?? '');
      setActiveFlagFilter(seed.flagFilter ?? null);
    }
  }

  const clearSeed = () => {
    setQuery('');
    setActiveFlagFilter(null);
    onClearSeed?.();
  };
  const rows = useMemo(() => bundle?.rawRows ?? [], [bundle?.rawRows]);
  const flaggedRowCount = useMemo(
    () => rows.filter((row) => rawDataFlagDefinitions.some((definition) => row.flags[definition.key])).length,
    [rows],
  );
  const queryActive = query.trim().length > 0;

  const toggleFlagFilter = (filter: RawDataFlagFilter) => {
    setActiveFlagFilter((current) => (current === filter ? null : filter));
  };

  if (!bundle) {
    return <EmptyState title="No raw rows ready" detail="Import data and select investors to inspect source row evidence." />;
  }

  const truncated = bundle.rowCount > rows.length;

  return (
    <section className={`panel-card raw-panel${inline ? ' raw-panel--inline' : ''}`} title="Inspect the imported source rows for the selected investor set and export the filtered row set.">
      {truncated ? (
        <div
          role="note"
          style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8, color: '#9a3412', fontSize: 13, fontWeight: 600, marginBottom: 12, padding: '8px 12px' }}
        >
          Showing the first {rows.length.toLocaleString()} of {bundle.rowCount.toLocaleString()} selected rows.
          Flag counts, search, and the CSV export cover only this sample - narrow the investor selection or filters to inspect everything.
        </div>
      ) : null}
      <div className="raw-header">
        <div className="raw-heading">
          <span>{inline ? 'Rows behind' : 'Evidence inspector'}</span>
          <h2>{inline && scopeTitle ? scopeTitle : 'Raw Data'}</h2>
          {seed ? (
            <button className="raw-seed-chip" type="button" onClick={clearSeed} title={`Scoped: ${seed.label}. Click to remove this scope.`}>
              {seed.label} <X size={12} />
            </button>
          ) : null}
        </div>
        <label className="search-box compact raw-search" title="Search investor, company, CAPCALLDIST, dates, values, flag names, and raw source fields.">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search investor, company, row, flag, or value"
            title="Search investor, company, CAPCALLDIST, dates, values, flag names, and raw source fields."
            aria-label="Search raw data rows"
          />
          {queryActive ? (
            <button className="raw-search-clear" type="button" onClick={() => setQuery('')} aria-label="Clear raw data search" title="Clear search">
              <X size={14} />
            </button>
          ) : null}
        </label>
      </div>
      {/* The flag-chip quick filters are tall and wrap; the inline (under an
          expanded chart) variant relies on the QA Flags column filter + search
          instead, keeping the panel compact so rows stay visible. */}
      {inline ? null : (
        <div className="raw-flag-row" title="Quick filters for QA flags found in the selected investor set's raw rows.">
          <span className="raw-filter-label">Row flags</span>
          <FlagFilterChip
            active={activeFlagFilter === null}
            count={rows.length}
            label="All rows"
            onClick={() => setActiveFlagFilter(null)}
            title="Show every selected raw row."
          />
          <FlagFilterChip
            active={activeFlagFilter === 'flagged'}
            count={flaggedRowCount}
            disabled={!flaggedRowCount && activeFlagFilter !== 'flagged'}
            label="Has any flag"
            onClick={() => toggleFlagFilter('flagged')}
            title={`${flaggedRowCount} selected raw rows have at least one QA flag.`}
          />
          {rawDataFlagDefinitions.map((definition) => (
            <RowFlagFilterChip
              active={activeFlagFilter === definition.key}
              definition={definition}
              key={definition.key}
              onClick={() => toggleFlagFilter(definition.key)}
              rows={rows}
            />
          ))}
        </div>
      )}
      <RawDataTable
        activeFlagFilter={activeFlagFilter}
        onClearFlagFilter={() => setActiveFlagFilter(null)}
        onClearSearch={() => setQuery('')}
        query={query}
        rows={rows}
        fill={inline}
      />
    </section>
  );
}

function RowFlagFilterChip({
  active,
  definition,
  onClick,
  rows,
}: {
  active: boolean;
  definition: RawDataFlagDefinition;
  onClick: () => void;
  rows: BIRow[];
}) {
  const count = rows.filter((row) => row.flags[definition.key]).length;
  return (
    <FlagFilterChip
      active={active}
      count={count}
      disabled={!count && !active}
      label={definition.label}
      onClick={onClick}
      title={`${count} selected raw rows match this flag. ${definition.explanation}`}
    />
  );
}

function FlagFilterChip({
  active,
  count,
  disabled,
  label,
  onClick,
  title,
}: {
  active: boolean;
  count: number;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      aria-pressed={active}
      className={`raw-flag-chip ${active ? 'active' : ''} ${count ? 'has-count' : 'is-empty'}`}
      disabled={disabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      <strong>{count.toLocaleString()}</strong>
      <span>{label}</span>
    </button>
  );
}
