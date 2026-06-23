import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Filter,
  RotateCcw,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { List } from 'react-window';
import type { ListImperativeAPI, RowComponentProps } from 'react-window';
import { DATE_KEYS, FIELD_TO_HEADER, NUMERIC_KEYS } from '../data/columns';
import type { BIRow, RowFlags } from '../types';
import { downloadTextFile, toISODate } from '../utils/format';
import { Pill } from './common';
import { compareSortValues, textMatchesQuery, type SortDirection } from './rawDataSort';

type RawDataColumnKey = keyof BIRow | 'qaFlags';
type RawDataFieldKey = Exclude<keyof BIRow, 'flags' | 'raw'>;
type RawDataFlagFilter = keyof RowFlags | 'flagged' | null;

type RawDataColumn = {
  key: RawDataColumnKey;
  label: string;
  width: number;
  align?: 'left' | 'right';
  pinned?: boolean;
  value: (row: BIRow) => unknown;
  filterText: (row: BIRow) => string;
  sortValue: (row: BIRow) => unknown;
};

type SortState = {
  key: RawDataColumnKey;
  direction: SortDirection;
} | null;

type RawDataRowProps = {
  rows: BIRow[];
  columns: RawDataColumn[];
  gridTemplateColumns: string;
  lastPinnedKey: RawDataColumnKey | null;
  pinnedOffsets: Partial<Record<RawDataColumnKey, number>>;
  selectedRowId: number | null;
  totalWidth: number;
  onSelectRow: (rowId: number) => void;
};

type RawDataFlagDefinition = {
  key: keyof RowFlags;
  label: string;
  explanation: string;
};

const rowHeight = 46;
const headerHeight = 94;
const maxTableHeight = 560;
const minimumTableHeight = 180;
const numericKeySet = new Set<keyof BIRow>(NUMERIC_KEYS);
const dateKeySet = new Set<keyof BIRow>(DATE_KEYS);

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

const sourceColumnKeys = [
  'companySubcategoryType',
  'investorType',
  'investorGroupName',
  'investorNo',
  'investorShortCode',
  'postingDate',
  'postingYear',
  'postingQuarter',
  'postingQuarterLabel',
  'capCallDistCode',
  'investorTotalCommitments',
  'contributionsAffectRemainingCommitment',
  'recallableDistributions',
  'waiver',
  'unfundedCapitalAdjustment',
  'investorAvailableUnfundedCommitments',
  'actualContributions',
  'actualDistributions',
  'placementFees',
  'netInvestmentIncome',
  'realizedGain',
  'unrealizedGain',
  'transferOfInterest',
  'capitalAccountBalance',
  'carryBalance',
  'carryTransfer',
  'endingNavGrossCarry',
  'carryRealized',
  'carryUnrealized',
  'carryPaid',
  'itdContributions',
  'itdGrossContributions',
  'investmentsValue',
  'totalContributions',
  'totalDistributions',
  'investmentStrategy',
  'accountingBasis',
  'fundCurrencyCode',
  'auditor',
  'managementFeePctDuringIP',
  'managementFeePctThereafter',
  'managementFeePctThereafterDescription',
  'modelType',
  'carriedInterestPct',
  'carriedInterestPctDescription',
  'hurdleRatePreferredReturn',
  'hurdleRatePreferredReturnDescription',
  'investorSideLetterDate',
  'dateMostRecentPartnershipAgreement',
  'dateOperationsCommenced',
  'investmentCost',
  'investmentRealizedDistribution',
  'specialProfits',
  'partnerTransfer',
  'partnerTransferInvestmentActivity',
  'partnerTransferContribution',
  'actualInvestmentActivity',
] as const satisfies ReadonlyArray<RawDataFieldKey>;

const columnWidths: Partial<Record<RawDataColumnKey, number>> = {
  rowId: 86,
  investorPortalDisplayName: 230,
  companyGroupCode: 140,
  companyName: 240,
  qaFlags: 230,
  investorGroupName: 190,
  investorNo: 130,
  investorShortCode: 140,
  postingDate: 130,
  postingQuarterLabel: 130,
  capCallDistCode: 150,
  contributionsAffectRemainingCommitment: 240,
  investorAvailableUnfundedCommitments: 240,
  managementFeePctThereafterDescription: 250,
  carriedInterestPctDescription: 250,
  hurdleRatePreferredReturnDescription: 270,
  dateMostRecentPartnershipAgreement: 240,
  partnerTransferInvestmentActivity: 240,
};

const rawDataColumns: RawDataColumn[] = [
  makeColumn('rowId', { label: 'Source Row', pinned: true, width: 86 }),
  makeColumn('investorPortalDisplayName', { label: 'Investor', pinned: true, width: 230, accessor: investorDisplayName }),
  makeColumn('companyName', { label: 'Company', pinned: true, width: 240 }),
  makeColumn('companyGroupCode', { label: 'Group Code', width: 140 }),
  {
    key: 'qaFlags',
    label: 'QA Flags',
    width: columnWidths.qaFlags ?? 220,
    value: (row) => activeFlags(row).length,
    filterText: (row) => activeFlags(row).map((flag) => `${flag.label} ${flag.explanation}`).join(' '),
    sortValue: (row) => activeFlags(row).length,
  },
  ...sourceColumnKeys.map((key) => makeColumn(key)),
];

const focusedColumnKeys = new Set<RawDataColumnKey>([
  'rowId',
  'investorPortalDisplayName',
  'companyName',
  'companyGroupCode',
  'qaFlags',
  'postingDate',
  'postingQuarterLabel',
  'capCallDistCode',
  'fundCurrencyCode',
  'investorTotalCommitments',
  'actualContributions',
  'actualDistributions',
  'investorAvailableUnfundedCommitments',
  'capitalAccountBalance',
  'endingNavGrossCarry',
  'investmentsValue',
  'totalContributions',
  'totalDistributions',
  'carryPaid',
]);

const columnByKey = new Map(rawDataColumns.map((column) => [column.key, column]));

export function RawDataTable({
  activeFlagFilter,
  onClearFlagFilter,
  onClearSearch,
  query,
  rows,
  fill = false,
}: {
  activeFlagFilter: RawDataFlagFilter;
  onClearFlagFilter: () => void;
  onClearSearch: () => void;
  query: string;
  rows: BIRow[];
  /** Fill the parent's height (flex column + virtualized list sized to the
   *  available scroll frame) instead of self-sizing to the row count. Used
   *  inline under an expanded chart, where a splitter drives the height. */
  fill?: boolean;
}) {
  const listRef = useRef<ListImperativeAPI | null>(null);
  // In fill mode the list height tracks the resizable scroll frame rather than
  // the row count; a ResizeObserver feeds the measured height back to the List.
  const scrollFrameRef = useRef<HTMLDivElement | null>(null);
  const [frameHeight, setFrameHeight] = useState(0);
  useEffect(() => {
    if (!fill) return;
    const frame = scrollFrameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.height ?? 0;
      setFrameHeight((current) => (Math.abs(current - next) > 0.5 ? next : current));
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [fill]);
  const [sort, setSort] = useState<SortState>(null);
  const [columnFilters, setColumnFilters] = useState<Partial<Record<RawDataColumnKey, string>>>({});
  const [selectedRowId, setSelectedRowId] = useState<number | null>(() => rows[0]?.rowId ?? null);
  const [showAllColumns, setShowAllColumns] = useState(false);
  const displayedColumns = useMemo(
    () => (showAllColumns ? rawDataColumns : rawDataColumns.filter((column) => focusedColumnKeys.has(column.key))),
    [showAllColumns],
  );
  const pinnedOffsets = useMemo(() => getPinnedOffsets(displayedColumns), [displayedColumns]);
  const lastPinnedKey = useMemo(() => [...displayedColumns].reverse().find((column) => column.pinned)?.key ?? null, [displayedColumns]);
  const totalTableWidth = useMemo(() => displayedColumns.reduce((total, column) => total + column.width, 0), [displayedColumns]);
  const gridTemplateColumns = useMemo(() => displayedColumns.map((column) => `${column.width}px`).join(' '), [displayedColumns]);

  const visibleRows = useMemo(() => {
    const globalQuery = query.trim().toLowerCase();
    const activeColumnFilters = Object.entries(columnFilters)
      .map(([key, value]) => [key as RawDataColumnKey, value.trim().toLowerCase()] as const)
      .filter(([, value]) => value.length > 0);

    const matched = rows.filter((row) => {
      if (activeFlagFilter && !rowMatchesFlagFilter(row, activeFlagFilter)) return false;
      if (globalQuery && !textMatchesQuery(rowSearchText(row), globalQuery)) return false;
      return activeColumnFilters.every(([key, filterValue]) => {
        const column = columnByKey.get(key);
        return column ? textMatchesQuery(column.filterText(row).toLowerCase(), filterValue) : true;
      });
    });

    if (!sort) return matched;
    const column = columnByKey.get(sort.key);
    if (!column) return matched;
    return [...matched].sort((left, right) => compareSortValues(column.sortValue(left), column.sortValue(right), sort.direction));
  }, [activeFlagFilter, columnFilters, query, rows, sort]);

  const effectiveSelectedRowId = visibleRows.some((row) => row.rowId === selectedRowId) ? selectedRowId : visibleRows[0]?.rowId ?? null;
  const selectedIndex = useMemo(
    () => visibleRows.findIndex((row) => row.rowId === effectiveSelectedRowId),
    [effectiveSelectedRowId, visibleRows],
  );
  const selectedRow = selectedIndex >= 0 ? visibleRows[selectedIndex] : null;
  const activeFilterCount = Object.values(columnFilters).filter((value) => value?.trim()).length;
  const hasSearch = query.trim().length > 0;
  const hasActiveViewState = Boolean(activeFilterCount || activeFlagFilter || hasSearch || sort);
  const listHeight = visibleRows.length ? Math.min(maxTableHeight, Math.max(minimumTableHeight, visibleRows.length * rowHeight)) : minimumTableHeight;
  // Fill mode: the virtualized list fills the measured scroll frame (so a
  // splitter drag reveals more rows); self-sizing mode caps at maxTableHeight.
  const listViewportHeight = fill
    ? Math.max(minimumTableHeight + headerHeight, frameHeight || minimumTableHeight + headerHeight)
    : listHeight + headerHeight;

  useEffect(() => {
    if (selectedIndex >= 0) {
      listRef.current?.scrollToRow({ index: selectedIndex, align: 'smart', behavior: 'auto' });
    }
  }, [selectedIndex]);

  const updateColumnFilter = useCallback((key: RawDataColumnKey, value: string) => {
    setColumnFilters((current) => {
      const next = { ...current };
      if (value.trim()) next[key] = value;
      else delete next[key];
      return next;
    });
  }, []);

  const toggleSort = useCallback((key: RawDataColumnKey) => {
    setSort((current) => {
      if (!current || current.key !== key) return { key, direction: 'asc' };
      if (current.direction === 'asc') return { key, direction: 'desc' };
      return null;
    });
  }, []);

  const goToIndex = useCallback(
    (index: number) => {
      if (!visibleRows.length) return;
      const clampedIndex = Math.min(Math.max(index, 0), visibleRows.length - 1);
      setSelectedRowId(visibleRows[clampedIndex].rowId);
      listRef.current?.scrollToRow({ index: clampedIndex, align: 'center', behavior: 'auto' });
    },
    [visibleRows],
  );

  const exportRows = useCallback(() => {
    downloadTextFile('selected-investor-set-rows.csv', toCsv(visibleRows), 'text/csv;charset=utf-8');
  }, [visibleRows]);

  const clearColumnFilters = useCallback(() => setColumnFilters({}), []);
  const clearViewState = useCallback(() => {
    setColumnFilters({});
    setSort(null);
    onClearFlagFilter();
    onClearSearch();
  }, [onClearFlagFilter, onClearSearch]);
  const toggleColumnMode = useCallback(() => {
    setShowAllColumns((current) => {
      const next = !current;
      if (!next) {
        setColumnFilters((filters) => removeHiddenColumnFilters(filters));
      }
      return next;
    });
  }, []);

  const rowProps = useMemo<RawDataRowProps>(
    () => ({
      rows: visibleRows,
      columns: displayedColumns,
      gridTemplateColumns,
      lastPinnedKey,
      pinnedOffsets,
      selectedRowId: effectiveSelectedRowId,
      totalWidth: totalTableWidth,
      onSelectRow: setSelectedRowId,
    }),
    [displayedColumns, effectiveSelectedRowId, gridTemplateColumns, lastPinnedKey, pinnedOffsets, totalTableWidth, visibleRows],
  );
  const activeFlagLabel = activeFlagFilter ? flagFilterLabel(activeFlagFilter) : null;

  return (
    <div style={fill ? tableShellFillStyle : tableShellStyle}>
      <div style={tableToolbarStyle}>
        <div style={tableStatusStyle}>
          <strong>{visibleRows.length.toLocaleString()}</strong>
          <span className="muted">matched of {rows.length.toLocaleString()} loaded rows</span>
          <Pill tone={showAllColumns ? 'neutral' : 'good'} title={showAllColumns ? 'Every raw column is visible.' : 'Only key evidence columns are visible. Export still includes all raw columns.'}>
            {showAllColumns ? 'All fields' : 'Key fields'}
          </Pill>
          {activeFlagLabel ? <Pill tone="warn" title={`Filtered to ${activeFlagLabel}.`}>{activeFlagLabel}</Pill> : null}
          {activeFilterCount ? <Pill tone="warn" title={`${activeFilterCount} column ${activeFilterCount === 1 ? 'filter is' : 'filters are'} active.`}>{activeFilterCount} {activeFilterCount === 1 ? 'filter' : 'filters'}</Pill> : null}
          {sort ? <Pill tone="neutral" title={`Sorted by ${columnByKey.get(sort.key)?.label ?? 'column'} ${sort.direction === 'asc' ? 'ascending' : 'descending'}.`}>{`${columnByKey.get(sort.key)?.label ?? 'Sorted'} ${sort.direction === 'asc' ? '↑' : '↓'}`}</Pill> : null}
        </div>
        <div style={navigationStyle} title="Move through the current selected row set.">
          <button className="icon-button" type="button" onClick={() => goToIndex(0)} disabled={!visibleRows.length || selectedIndex <= 0} aria-label="First row" title="First row">
            <SkipBack size={15} />
          </button>
          <button className="icon-button" type="button" onClick={() => goToIndex(selectedIndex - 1)} disabled={!visibleRows.length || selectedIndex <= 0} aria-label="Previous row" title="Previous row">
            <ChevronLeft size={15} />
          </button>
          <input
            type="number"
            min={visibleRows.length ? 1 : 0}
            max={visibleRows.length}
            value={selectedIndex >= 0 ? selectedIndex + 1 : 0}
            onChange={(event) => goToIndex(Number(event.target.value) - 1)}
            aria-label="Selected row position"
            title="Selected row position"
            style={rowJumpInputStyle}
          />
          <span className="muted">/ {visibleRows.length.toLocaleString()}</span>
          <button className="icon-button" type="button" onClick={() => goToIndex(selectedIndex + 1)} disabled={!visibleRows.length || selectedIndex >= visibleRows.length - 1} aria-label="Next row" title="Next row">
            <ChevronRight size={15} />
          </button>
          <button className="icon-button" type="button" onClick={() => goToIndex(visibleRows.length - 1)} disabled={!visibleRows.length || selectedIndex >= visibleRows.length - 1} aria-label="Last row" title="Last row">
            <SkipForward size={15} />
          </button>
        </div>
        <button className="icon-text-button" type="button" onClick={toggleColumnMode} aria-pressed={showAllColumns} title={showAllColumns ? 'Return to the focused evidence columns.' : 'Show every available raw source column.'}>
          <Columns3 size={15} /> {showAllColumns ? 'Key fields' : 'All fields'}
        </button>
        <button className="icon-text-button" type="button" onClick={clearViewState} disabled={!hasActiveViewState} title="Clear search, flag filters, column filters, and sort.">
          <RotateCcw size={15} /> Clear view
        </button>
        <button className="icon-text-button" type="button" onClick={clearColumnFilters} disabled={!activeFilterCount} title="Clear only column filters.">
          <Filter size={15} /> Columns
        </button>
        <button className="icon-text-button" type="button" onClick={exportRows} disabled={!visibleRows.length} title="Download matched rows as CSV with all raw columns included.">
          <Download size={15} /> Export matched CSV
        </button>
      </div>

      {/* The selected-row detail panel is tall; in the inline (fill) variant
          the grid itself is the evidence, so we drop it to keep rows visible. */}
      {fill ? null : <SelectedRowDetail row={selectedRow} selectedIndex={selectedIndex} matchedCount={visibleRows.length} />}

      <div ref={scrollFrameRef} style={fill ? scrollFrameFillStyle : scrollFrameStyle} title="Raw imported row values for the selected investor set.">
        {visibleRows.length ? (
          <List
            listRef={listRef}
            rowComponent={VirtualRow}
            rowCount={visibleRows.length}
            rowHeight={rowHeight}
            rowProps={rowProps}
            overscanCount={12}
            style={{ height: listViewportHeight, width: '100%', overflowX: 'auto' }}
          >
            <RawDataHeader
              columns={displayedColumns}
              columnFilters={columnFilters}
              gridTemplateColumns={gridTemplateColumns}
              lastPinnedKey={lastPinnedKey}
              pinnedOffsets={pinnedOffsets}
              sort={sort}
              totalWidth={totalTableWidth}
              onFilterChange={updateColumnFilter}
              onSort={toggleSort}
            />
          </List>
        ) : (
          <div style={{ minWidth: totalTableWidth }}>
            <RawDataHeader
              columns={displayedColumns}
              columnFilters={columnFilters}
              gridTemplateColumns={gridTemplateColumns}
              lastPinnedKey={lastPinnedKey}
              pinnedOffsets={pinnedOffsets}
              sort={sort}
              totalWidth={totalTableWidth}
              onFilterChange={updateColumnFilter}
              onSort={toggleSort}
            />
            <div style={emptyTableStyle}>
              <strong style={emptyTitleStyle}>No rows match this view</strong>
              <span style={emptyDetailStyle}>Clear search, row flags, or column filters to widen the evidence set.</span>
              <button className="icon-text-button" type="button" onClick={clearViewState} disabled={!hasActiveViewState} title="Clear search, flag filters, column filters, and sort.">
                <RotateCcw size={15} /> Clear view
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RawDataHeader({
  columns,
  columnFilters,
  gridTemplateColumns,
  lastPinnedKey,
  pinnedOffsets,
  sort,
  totalWidth,
  onFilterChange,
  onSort,
}: {
  columns: RawDataColumn[];
  columnFilters: Partial<Record<RawDataColumnKey, string>>;
  gridTemplateColumns: string;
  lastPinnedKey: RawDataColumnKey | null;
  pinnedOffsets: Partial<Record<RawDataColumnKey, number>>;
  sort: SortState;
  totalWidth: number;
  onFilterChange: (key: RawDataColumnKey, value: string) => void;
  onSort: (key: RawDataColumnKey) => void;
}) {
  return (
    <div role="row" style={{ ...headerRowStyle, width: totalWidth, gridTemplateColumns }}>
      {columns.map((column) => (
        <HeaderCell
          key={String(column.key)}
          column={column}
          filterValue={columnFilters[column.key] ?? ''}
          lastPinnedKey={lastPinnedKey}
          pinnedLeft={pinnedOffsets[column.key]}
          sort={sort}
          onFilterChange={onFilterChange}
          onSort={onSort}
        />
      ))}
    </div>
  );
}

function HeaderCell({
  column,
  filterValue,
  lastPinnedKey,
  pinnedLeft,
  sort,
  onFilterChange,
  onSort,
}: {
  column: RawDataColumn;
  filterValue: string;
  lastPinnedKey: RawDataColumnKey | null;
  pinnedLeft?: number;
  sort: SortState;
  onFilterChange: (key: RawDataColumnKey, value: string) => void;
  onSort: (key: RawDataColumnKey) => void;
}) {
  const sortDirection = sort?.key === column.key ? sort.direction : null;
  const SortIcon = sortDirection === 'asc' ? ArrowUp : sortDirection === 'desc' ? ArrowDown : ArrowDownUp;
  return (
    <div
      role="columnheader"
      aria-sort={sortDirection === 'asc' ? 'ascending' : sortDirection === 'desc' ? 'descending' : 'none'}
      style={cellStyle(column, pinnedLeft, lastPinnedKey, true, false)}
    >
      <button type="button" onClick={() => onSort(column.key)} aria-label={`Sort by ${column.label}`} title={`Sort ${column.label}`} style={sortButtonStyle}>
        <span style={headerLabelStyle}>{column.label}</span>
        <SortIcon size={13} />
      </button>
      <label style={filterBoxStyle} title={`Filter ${column.label}`}>
        <Filter size={11} />
        <input
          value={filterValue}
          onChange={(event) => onFilterChange(column.key, event.target.value)}
          placeholder="Filter"
          aria-label={`Filter ${column.label}`}
          style={filterInputStyle}
        />
      </label>
    </div>
  );
}

function VirtualRow({
  index,
  style,
  ariaAttributes,
  rows,
  columns,
  gridTemplateColumns,
  lastPinnedKey,
  pinnedOffsets,
  selectedRowId,
  totalWidth,
  onSelectRow,
}: RowComponentProps<RawDataRowProps>) {
  const row = rows[index];
  if (!row) return null;
  const selected = row.rowId === selectedRowId;
  const selectRow = () => onSelectRow(row.rowId);
  return (
    <div
      {...ariaAttributes}
      role="row"
      aria-selected={selected}
      aria-label={`Source row ${row.rowId}: ${investorDisplayName(row) ?? 'No investor'}, ${row.companyName ?? 'no company'}`}
      tabIndex={0}
      onClick={selectRow}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectRow();
        }
      }}
      style={{
        ...style,
        transform: `${style.transform ?? ''} translateY(${headerHeight}px)`.trim(),
        width: totalWidth,
        display: 'grid',
        gridTemplateColumns,
        background: selected ? '#eff6ff' : index % 2 ? '#ffffff' : '#fbfcfe',
        cursor: 'pointer',
      }}
      title={`Row ${row.rowId}`}
    >
      {columns.map((column) => (
        <div key={String(column.key)} role="cell" style={cellStyle(column, pinnedOffsets[column.key], lastPinnedKey, false, selected)}>
          {column.key === 'qaFlags' ? <FlagCell row={row} /> : <CellValue column={column} row={row} />}
        </div>
      ))}
    </div>
  );
}

function CellValue({ column, row }: { column: RawDataColumn; row: BIRow }) {
  const value = formatCell(column.value(row));
  if (!value) return <span style={emptyCellTextStyle}>Blank</span>;
  return <span style={cellTextStyle(column)} title={value}>{value}</span>;
}

const emptyCellTextStyle: CSSProperties = {
  color: '#94a3b8',
  fontSize: 12,
  fontWeight: 760,
};

function SelectedRowDetail({ row, selectedIndex, matchedCount }: { row: BIRow | null; selectedIndex: number; matchedCount: number }) {
  const flags = row ? activeFlags(row) : [];
  const facts = row ? selectedRowFacts(row) : [];
  return (
    <div style={selectedDetailStyle}>
      <div style={selectedDetailHeaderStyle}>
        <span className="muted">Selected row</span>
        <strong>{row ? `${selectedIndex + 1} of ${matchedCount.toLocaleString()} - source row ${row.rowId}` : 'No row selected'}</strong>
      </div>
      <div style={selectedMetaStyle}>
        <span>{row ? investorDisplayName(row) ?? 'No investor' : 'No investor'}</span>
        <span>{row?.companyName ?? 'No company'}</span>
        <span>{row?.postingQuarterLabel ?? 'No quarter'}</span>
      </div>
      {facts.length ? (
        <div style={selectedFactsStyle}>
          {facts.map((fact) => (
            <div key={fact.label} style={selectedFactStyle} title={`${fact.label}: ${fact.value}`}>
              <span style={selectedFactLabelStyle}>{fact.label}</span>
              <strong style={selectedFactValueStyle}>{fact.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
      <div style={flagExplanationStyle}>
        {!row ? (
          <div style={flagExplanationItemStyle}>
            <Pill tone="neutral" title="No matched row is selected.">No row selected</Pill>
            <span>Clear search or filters to bring row evidence back into view.</span>
          </div>
        ) : flags.length ? (
          flags.map((flag) => (
            <div key={flag.key} style={flagExplanationItemStyle}>
              <Pill tone="warn" title={flag.explanation}>{flag.label}</Pill>
              <span>{flag.explanation}</span>
            </div>
          ))
        ) : (
          <div style={flagExplanationItemStyle}>
            <Pill tone="good" title="The selected row has no row-level QA flags.">No QA flags</Pill>
            <span>The selected row has no row-level QA flags.</span>
          </div>
        )}
      </div>
    </div>
  );
}

function selectedRowFacts(row: BIRow): Array<{ label: string; value: string }> {
  return [
    { label: 'CAPCALLDIST', value: row.capCallDistCode?.trim() || 'Blank' },
    { label: 'Posting date', value: formatCell(row.postingDate) || 'No date' },
    { label: 'Contribution', value: formatCell(row.actualContributions) },
    { label: 'Distribution', value: formatCell(row.actualDistributions) },
    { label: 'Unfunded', value: formatCell(row.investorAvailableUnfundedCommitments) },
    { label: 'Ending NAV', value: formatCell(row.endingNavGrossCarry) },
  ];
}

function FlagCell({ row }: { row: BIRow }) {
  const flags = activeFlags(row);
  if (!flags.length) return <span style={noFlagStyle}>No flags</span>;
  return (
    <span style={flagCellStyle} title={flags.map((flag) => `${flag.label}: ${flag.explanation}`).join('\n')}>
      {flags.slice(0, 2).map((flag) => (
        <span key={flag.key} style={miniFlagStyle}>{flag.label}</span>
      ))}
      {flags.length > 2 ? <span style={miniFlagCountStyle}>+{flags.length - 2}</span> : null}
    </span>
  );
}

function makeColumn(
  key: RawDataFieldKey,
  options: { label?: string; width?: number; pinned?: boolean; accessor?: (row: BIRow) => unknown } = {},
): RawDataColumn {
  const accessor = options.accessor ?? ((row: BIRow) => row[key]);
  return {
    key,
    label: options.label ?? FIELD_TO_HEADER[String(key)] ?? humanizeKey(String(key)),
    width: options.width ?? columnWidths[key] ?? defaultWidthForKey(key),
    align: numericKeySet.has(key) ? 'right' : 'left',
    pinned: options.pinned,
    value: accessor,
    filterText: (row) => formatCell(accessor(row)),
    sortValue: accessor,
  };
}

// Real BI exports may omit Investor Portal Display Name; Investor Group Name is
// populated on every row, so identity columns must not render blank without it.
function investorDisplayName(row: BIRow): string | null {
  return row.investorPortalDisplayName ?? row.investorGroupName ?? null;
}

function defaultWidthForKey(key: keyof BIRow): number {
  if (numericKeySet.has(key)) return 155;
  if (dateKeySet.has(key)) return 145;
  return 170;
}

function activeFlags(row: BIRow): RawDataFlagDefinition[] {
  return rawDataFlagDefinitions.filter((definition) => row.flags[definition.key]);
}

function rowMatchesFlagFilter(row: BIRow, filter: Exclude<RawDataFlagFilter, null>): boolean {
  if (filter === 'flagged') return activeFlags(row).length > 0;
  return row.flags[filter];
}

function flagFilterLabel(filter: Exclude<RawDataFlagFilter, null>): string {
  if (filter === 'flagged') return 'Rows with flags';
  return rawDataFlagDefinitions.find((definition) => definition.key === filter)?.label ?? 'Flagged rows';
}

function removeHiddenColumnFilters(filters: Partial<Record<RawDataColumnKey, string>>): Partial<Record<RawDataColumnKey, string>> {
  return Object.fromEntries(
    Object.entries(filters).filter(([key]) => focusedColumnKeys.has(key as RawDataColumnKey)),
  ) as Partial<Record<RawDataColumnKey, string>>;
}

function getPinnedOffsets(columns: RawDataColumn[]): Partial<Record<RawDataColumnKey, number>> {
  let offset = 0;
  const offsets: Partial<Record<RawDataColumnKey, number>> = {};
  columns.forEach((column) => {
    if (!column.pinned) return;
    offsets[column.key] = offset;
    offset += column.width;
  });
  return offsets;
}

function rowSearchText(row: BIRow): string {
  const normalizedValues = rawDataColumns.map((column) => column.filterText(row));
  return `${JSON.stringify(row.raw)} ${normalizedValues.join(' ')}`.toLowerCase();
}

function formatCell(value: unknown): string {
  if (value instanceof Date) return toISODate(value) ?? '';
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(value);
}

function toCsv(rows: BIRow[]): string {
  const headers = rawDataColumns.map((column) => csvEscape(column.label));
  const lines = rows.map((row) =>
    rawDataColumns
      .map((column) => {
        const value = column.key === 'qaFlags' ? activeFlags(row).map((flag) => flag.label).join('; ') : formatCell(column.value(row));
        return csvEscape(value);
      })
      .join(','),
  );
  return [headers.join(','), ...lines].join('\n');
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function humanizeKey(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}

function cellStyle(
  column: RawDataColumn,
  pinnedLeft: number | undefined,
  lastPinnedColumnKey: RawDataColumnKey | null,
  header: boolean,
  selected: boolean,
): CSSProperties {
  const pinned = pinnedLeft !== undefined;
  return {
    minWidth: 0,
    height: header ? headerHeight : rowHeight,
    padding: header ? '10px' : '0 12px',
    display: header ? 'grid' : 'flex',
    alignItems: 'center',
    gap: header ? 7 : 0,
    borderRight: pinned && column.key === lastPinnedColumnKey ? '1px solid #cbd5e1' : '1px solid #e5e7eb',
    borderBottom: header ? '1px solid #d9e2ec' : '1px solid #eef2f6',
    background: pinned ? (header ? '#f8fafc' : selected ? '#eff6ff' : '#fffdf8') : undefined,
    boxShadow: pinned && column.key === lastPinnedColumnKey ? '10px 0 18px rgba(15, 23, 42, 0.12)' : undefined,
    left: pinned ? pinnedLeft : undefined,
    position: pinned ? 'sticky' : undefined,
    zIndex: pinned ? (header ? 8 : 4) : header ? 3 : 1,
    textAlign: column.align ?? 'left',
  };
}

function cellTextStyle(column: RawDataColumn): CSSProperties {
  return {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    width: '100%',
    color: '#263444',
    fontSize: 13,
    fontWeight: column.pinned ? 760 : 620,
    lineHeight: 1.35,
    letterSpacing: 0,
    fontVariantNumeric: column.align === 'right' ? 'tabular-nums' : undefined,
  };
}

const tableShellStyle: CSSProperties = {
  display: 'grid',
  gap: 12,
};

// Fill mode: a flex column that grows to the parent's height so the scroll
// frame (and its virtualized list) can flex to fill a splitter-driven region.
// Expects a flex-column parent with a definite height (RawData inline variant).
const tableShellFillStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  flex: 1,
  minHeight: 0,
};

const tableToolbarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 10,
  justifyContent: 'space-between',
};

const tableStatusStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 8,
  color: '#172033',
};

const navigationStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const rowJumpInputStyle: CSSProperties = {
  width: 72,
  minHeight: 44,
  border: '1px solid #d9e2ec',
  borderRadius: 8,
  padding: '0 8px',
  fontWeight: 800,
  color: '#172033',
};

const selectedDetailStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
  padding: 14,
  border: '1px solid #d9e2ec',
  borderRadius: 8,
  background: 'linear-gradient(180deg, #fbfcfe, #ffffff)',
};

const selectedDetailHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  flexWrap: 'wrap',
  gap: 8,
};

const selectedMetaStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 8,
  color: '#526173',
  fontSize: 12,
  fontWeight: 800,
};

const selectedFactsStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
  gridTemplateColumns: 'repeat(auto-fit, minmax(138px, 1fr))',
};

const selectedFactStyle: CSSProperties = {
  minWidth: 0,
  display: 'grid',
  gap: 3,
  padding: '8px 10px',
  border: '1px solid #e2e8f0',
  borderRadius: 7,
  background: '#ffffff',
  color: '#172033',
};

const selectedFactLabelStyle: CSSProperties = {
  color: '#64748b',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0,
  textTransform: 'uppercase',
};

const selectedFactValueStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 13,
  fontVariantNumeric: 'tabular-nums',
};

const flagExplanationStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
};

const flagExplanationItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 8,
  color: '#526173',
  fontSize: 13,
  fontWeight: 700,
};

const scrollFrameStyle: CSSProperties = {
  width: '100%',
  overflow: 'hidden',
  border: '1px solid #d9e2ec',
  borderRadius: 8,
  background: '#ffffff',
};

const scrollFrameFillStyle: CSSProperties = {
  ...scrollFrameStyle,
  flex: 1,
  minHeight: 0,
};

const headerRowStyle: CSSProperties = {
  display: 'grid',
  height: headerHeight,
  position: 'sticky',
  top: 0,
  zIndex: 7,
  background: '#f8fafc',
};

const sortButtonStyle: CSSProperties = {
  width: '100%',
  minWidth: 0,
  minHeight: 34,
  border: 0,
  background: 'transparent',
  color: '#172033',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 6,
  padding: 0,
  fontSize: 12,
  fontWeight: 900,
  textAlign: 'left',
};

const headerLabelStyle: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const filterBoxStyle: CSSProperties = {
  minWidth: 0,
  minHeight: 30,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '0 7px',
  border: '1px solid #d9e2ec',
  borderRadius: 7,
  background: '#ffffff',
  color: '#667085',
};

const filterInputStyle: CSSProperties = {
  minWidth: 0,
  width: '100%',
  border: 0,
  outline: 0,
  background: 'transparent',
  color: '#172033',
  fontSize: 12,
};

const flagCellStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  minWidth: 0,
  overflow: 'hidden',
};

const miniFlagStyle: CSSProperties = {
  maxWidth: 88,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  border: '1px solid #fed7aa',
  borderRadius: 999,
  padding: '2px 6px',
  color: '#a15c07',
  background: '#fff7ed',
  fontSize: 10,
  fontWeight: 900,
};

const miniFlagCountStyle: CSSProperties = {
  color: '#667085',
  fontSize: 11,
  fontWeight: 900,
};

const noFlagStyle: CSSProperties = {
  color: '#667085',
  fontSize: 12,
  fontWeight: 800,
};

const emptyTableStyle: CSSProperties = {
  minHeight: minimumTableHeight,
  display: 'grid',
  placeItems: 'center',
  alignContent: 'center',
  gap: 8,
  padding: 18,
  textAlign: 'center',
  color: '#667085',
  fontSize: 13,
  fontWeight: 800,
};

const emptyTitleStyle: CSSProperties = {
  color: '#172033',
  fontSize: 14,
  fontWeight: 900,
};

const emptyDetailStyle: CSSProperties = {
  maxWidth: 420,
  color: '#64748b',
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.4,
};
