import * as XLSX from '@e965/xlsx';
import type { BIRow, ImportProgress, ImportSummary, InvestorOption, WorkerComparePayload, WorkerComputeBundleSetPayload, WorkerComputePayload, WorkerImportPayload } from '../types';
import { buildChartBundle, buildChartBundleSet, buildInvestorOptions, compareProductionDraft } from '../utils/charts';
import { parseCsvRows } from '../utils/csv';
import {
  appendTypeIssuesForRow,
  blockingTypeIssueGroups,
  createTypeIssueGroupAccumulator,
  finalizeTypeIssueGroups,
  formatBlockingTypeIssueProof,
  hasBlockingTypeIssues,
  normalizeBIRow,
  reconcileRowCounts,
  resolveValidationSeverity,
  validateHeaders,
} from '../utils/normalize';
import { classifyInvestorScenarios, scenarioInvestorsByBucketId } from '../utils/scenarioClassifier';
import { toISODate } from '../utils/format';
import { readLargeXlsxTable } from '../utils/largeXlsx';

type WorkerRequest =
  | { id: number; type: 'ping'; payload?: null }
  | { id: number; type: 'import'; payload: WorkerImportPayload }
  | { id: number; type: 'compute'; payload: WorkerComputePayload }
  | { id: number; type: 'computeBundleSet'; payload: WorkerComputeBundleSetPayload }
  | { id: number; type: 'compare'; payload: WorkerComparePayload };

let allRows: BIRow[] = [];
let rowsByInvestor = new Map<string, BIRow[]>();
let investorOptions = buildInvestorOptions([]);

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data;
  try {
    if (type === 'ping') {
      postMessage({ id, ok: true, type: 'pong' });
      return;
    }
    if (type === 'import') {
      const summary = await importWorkbook(payload, id);
      postMessage({ id, ok: true, type, payload: summary });
      return;
    }
    if (type === 'compute') {
      const bundle = buildChartBundle(
        allRows,
        rowsByInvestor,
        investorOptions,
        payload.investorKeys,
        payload.filters,
        payload.formulas,
        payload.logicVersion,
      );
      postMessage({ id, ok: true, type, payload: bundle });
      return;
    }
    if (type === 'computeBundleSet') {
      const bundleSet = buildChartBundleSet(
        allRows,
        rowsByInvestor,
        investorOptions,
        payload.investorKeys,
        payload.filters,
        payload.formulas,
        payload.logicVersion,
        { includeIndividualBundles: payload.includeIndividualBundles ?? true, includeRawRows: payload.includeRawRows ?? true },
      );
      postMessage({ id, ok: true, type, payload: bundleSet });
      return;
    }
    if (type === 'compare') {
      const comparison = compareProductionDraft(rowsByInvestor, investorOptions, payload.filters, payload.formulas);
      postMessage({ id, ok: true, type, payload: comparison });
    }
  } catch (error) {
    postMessage({ id, ok: false, type, error: error instanceof Error ? error.message : 'Worker request failed.' });
  }
};

async function importWorkbook(payload: WorkerImportPayload, requestId: number): Promise<ImportSummary> {
  const startedAt = Date.now();
  const report = (phase: string, detail?: string, processedRows?: number, totalRows?: number) => {
    reportImportProgress(requestId, { phase, detail, processedRows, totalRows, startedAt });
  };

  const { headerRowNumber, sheetName, table, timing } = await readImportTable(payload.file, report);
  report('Validating headers', `Checking required BI columns after ${formatTiming(timing.readMs + timing.parseMs)} of ${timing.sourceKind.toUpperCase()} loading.`);
  const headers = (table[0] ?? []).map((value) => String(value ?? '').trim());
  const validation = validateHeaders(headers, sheetName, Math.max(0, table.length - 1));
  internCache.clear();
  const nextAllRows: BIRow[] = [];
  const nextRowsByInvestor = new Map<string, BIRow[]>();
  const investorOptionMap = new Map<string, { option: InvestorOption; count: number }>();
  const programKeys = new Set<string>();
  const investorTypes = new Set<string>();
  const investorGroups = new Set<string>();
  const companyGroupCodes = new Set<string>();
  const companyNames = new Set<string>();
  const fundCurrencyCodes = new Set<string>();
  const typeIssues: string[] = [];
  const typeIssueGroups = createTypeIssueGroupAccumulator();
  let latestPostingDate: Date | null = null;
  const totalImportRows = Math.max(0, table.length - 1);
  const normalizeStartedAt = Date.now();
  let blankRowsSkipped = 0;
  report('Normalizing rows', 'Cleaning dates, numbers, labels, and raw values.', 0, totalImportRows);

  for (let rowIndex = 1; rowIndex < table.length; rowIndex += 1) {
    const row = table[rowIndex];
    if (!row || !rowHasAnyValue(row)) {
      blankRowsSkipped += 1;
      continue;
    }
    const raw = rowToRawRecord(headers, row);
    const normalizedRow = normalizeBIRow(raw, headerRowNumber + rowIndex);
    nextAllRows.push(normalizedRow);
    appendTypeIssuesForRow(normalizedRow, typeIssues, 25, typeIssueGroups);
    addToBucket(nextRowsByInvestor, normalizedRow.investorKey, normalizedRow);
    upsertInvestorOption(investorOptionMap, normalizedRow);
    programKeys.add(normalizedRow.programKey);
    addIfPresent(investorTypes, normalizedRow.investorType);
    addIfPresent(investorGroups, normalizedRow.investorGroupName);
    addIfPresent(companyGroupCodes, normalizedRow.companyGroupCode);
    addIfPresent(companyNames, normalizedRow.companyName);
    addIfPresent(fundCurrencyCodes, normalizedRow.fundCurrencyCode);
    if (normalizedRow.postingDate && (!latestPostingDate || normalizedRow.postingDate > latestPostingDate)) {
      latestPostingDate = normalizedRow.postingDate;
    }
    if (rowIndex % 10_000 === 0) {
      report('Normalizing rows', `${nextAllRows.length.toLocaleString()} rows indexed.`, rowIndex, totalImportRows);
    }
  }
  const normalizeMs = Date.now() - normalizeStartedAt;
  validation.typeIssues = typeIssues;
  validation.typeIssueGroups = finalizeTypeIssueGroups(typeIssueGroups);
  validation.rowCountReconciliation = reconcileRowCounts(totalImportRows, nextAllRows.length, blankRowsSkipped);
  const blockingTypeIssues = blockingTypeIssueGroups(validation.typeIssueGroups);
  validation.severity = resolveValidationSeverity(
    validation.missingColumnIssues.length,
    validation.extraColumnIssues.length + (validation.optionalColumnIssues?.length ?? 0),
    validation.typeIssueGroups.length,
    validation.rowCountReconciliation.rejectedRows,
    validation.duplicateColumnIssues.length,
    blockingTypeIssues.length,
  );
  if (hasBlockingTypeIssues(validation.typeIssueGroups)) {
    throw new Error(`Import rejected: number columns contain text. ${formatBlockingTypeIssueProof(validation.typeIssueGroups)} Number columns accept blanks, "-", 0, regular numbers, negative numbers, and parenthesized negatives.`);
  }
  report('Building investor index', `${nextAllRows.length.toLocaleString()} rows normalized.`, nextAllRows.length, totalImportRows);
  const nextInvestorOptions = Array.from(investorOptionMap.values())
    .map((value) => value.option)
    .sort((a, b) => a.label.localeCompare(b.label));
  report('Classifying scenarios', 'Grouping each investor into a sign-pattern scenario per visual.');
  const scenarioStartedAt = Date.now();
  const scenarioModel = classifyInvestorScenarios(nextAllRows);
  const scenarioInvestorsById = scenarioInvestorsByBucketId(scenarioModel);
  const scenarioMs = Date.now() - scenarioStartedAt;
  validation.timing = {
    ...timing,
    normalizeMs,
    scenarioMs,
    totalMs: Date.now() - startedAt,
  };
  report('Finalizing import', 'Preparing dashboard filters and validation summary.');
  allRows = nextAllRows;
  rowsByInvestor = nextRowsByInvestor;
  investorOptions = nextInvestorOptions;
  return {
    fileName: payload.file.name,
    validation,
    totalRows: nextAllRows.length,
    investorCount: nextInvestorOptions.length,
    programCount: programKeys.size,
    defaultInvestorKey: nextInvestorOptions[0]?.key ?? null,
    investorOptions: nextInvestorOptions,
    filterOptions: {
      investorTypes: sortedSet(investorTypes),
      investorGroups: sortedSet(investorGroups),
      companyGroupCodes: sortedSet(companyGroupCodes),
      companyNames: sortedSet(companyNames),
      fundCurrencyCodes: sortedSet(fundCurrencyCodes),
      maxDate: toISODate(latestPostingDate),
    },
    scenarioModel,
    scenarioInvestorsById,
  };
}

async function readImportTable(
  file: File,
  report: (phase: string, detail?: string, processedRows?: number, totalRows?: number) => void,
): Promise<{ headerRowNumber: number; sheetName: string; table: unknown[][]; timing: ImportSummary['validation']['timing'] }> {
  if (isCsvFile(file)) {
    report('Reading CSV', 'Loading text directly from the selected CSV file.');
    const readStartedAt = Date.now();
    const text = await file.text();
    const readMs = Date.now() - readStartedAt;
    report('Parsing CSV', 'Parsing quoted fields and row boundaries.');
    const parseStartedAt = Date.now();
    const table = parseCsvRows(text);
    const parseMs = Date.now() - parseStartedAt;
    report('Parsing CSV', `Parsed ${Math.max(0, table.length - 1).toLocaleString()} data rows in ${formatTiming(parseMs)}.`);
    return {
      headerRowNumber: 1,
      sheetName: 'CSV Import',
      table,
      timing: {
        sourceKind: 'csv',
        readMs,
        parseMs,
        normalizeMs: 0,
        scenarioMs: 0,
        totalMs: 0,
      },
    };
  }
  report('Reading Excel workbook', 'Loading the selected workbook into the import worker.');
  const readStartedAt = Date.now();
  const buffer = await file.arrayBuffer();
  const readMs = Date.now() - readStartedAt;
  report('Parsing Excel workbook', 'Unpacking worksheet data. CSV imports skip this slow step.');
  const parseStartedAt = Date.now();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, raw: true, dense: true });
  const sheetName = preferredWorksheetName(workbook.SheetNames);
  if (!sheetName) throw new Error('The Excel workbook does not contain any worksheets.');
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`The worksheet "${sheetName}" could not be read.`);
  const rawTable = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true, blankrows: false });
  const fallbackNeeded = rawTable.length === 0;
  const { headerRowNumber, table } = fallbackNeeded ? readLargeXlsxTable(buffer) : normalizeImportTable(rawTable);
  const parseMs = Date.now() - parseStartedAt;
  report('Parsing Excel workbook', `Parsed ${Math.max(0, table.length - 1).toLocaleString()} worksheet rows in ${formatTiming(parseMs)}${fallbackNeeded ? ' using the large-sheet reader' : ''}.`);
  return {
    headerRowNumber,
    sheetName,
    table,
    timing: {
      sourceKind: 'excel',
      readMs,
      parseMs,
      normalizeMs: 0,
      scenarioMs: 0,
      totalMs: 0,
    },
  };
}

function preferredWorksheetName(sheetNames: string[]): string | undefined {
  const dataSheet = sheetNames.find((name) => name.trim().toLowerCase() === 'data');
  return dataSheet ?? sheetNames[0];
}

function normalizeImportTable(table: unknown[][]): { headerRowNumber: number; table: unknown[][] } {
  const headerIndex = table.findIndex((row) => likelyHeaderRow(row));
  if (headerIndex <= 0) return { headerRowNumber: 1, table };
  return { headerRowNumber: headerIndex + 1, table: table.slice(headerIndex) };
}

function likelyHeaderRow(row: unknown[] | undefined): boolean {
  if (!row) return false;
  const headers = new Set(row.map((cell) => String(cell ?? '').trim()));
  const expected = ['Company Name', 'Investor No_', 'Investor Short Code', 'Posting Date', 'Actual Contributions', 'Actual Distributions'];
  return expected.filter((header) => headers.has(header)).length >= 4;
}

function reportImportProgress(id: number, progress: ImportProgress): void {
  postMessage({ id, ok: true, type: 'import-progress', progress });
}

function isCsvFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
}

function rowHasAnyValue(row: unknown[]): boolean {
  return row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '');
}

// BI exports repeat the same cell text constantly (codes, names, "None",
// formatted zeros). Interning repeated strings lets the ~24M retained raw
// cells share one string instance per distinct value instead of one per cell,
// cutting hundreds of MB at 400k+ rows. Capped so pathological all-unique
// columns cannot grow the cache without bound.
const INTERN_CACHE_LIMIT = 200_000;
const internCache = new Map<string, string>();

function internCell(value: unknown): unknown {
  // Long strings are rarely repeated and expensive to hash 24M times; only
  // short codes/names/amounts benefit from interning.
  if (typeof value !== 'string' || value.length > 64) return value;
  const cached = internCache.get(value);
  if (cached !== undefined) return cached;
  if (internCache.size < INTERN_CACHE_LIMIT) internCache.set(value, value);
  return value;
}

function rowToRawRecord(headers: string[], row: unknown[]): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
    raw[headers[columnIndex]] = internCell(row[columnIndex] ?? null);
  }
  return raw;
}

function addToBucket<T>(map: Map<string, T[]>, key: string, value: T): void {
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
}

function addIfPresent(set: Set<string>, value: string | null): void {
  if (value) set.add(value);
}

function sortedSet(set: Set<string>): string[] {
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function formatTiming(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function upsertInvestorOption(map: Map<string, { option: InvestorOption; count: number }>, row: BIRow): void {
  const existing = map.get(row.investorKey);
  if (existing) {
    existing.count += 1;
    existing.option.rowCount = existing.count;
    return;
  }
  map.set(row.investorKey, {
    count: 1,
    option: {
      key: row.investorKey,
      label: `${row.investorPortalDisplayName ?? row.investorGroupName ?? 'Unnamed investor'} - ${row.companyName ?? 'No company'} - ${row.investorNo ?? 'No investor no'}`,
      investorPortalDisplayName: row.investorPortalDisplayName,
      investorGroupName: row.investorGroupName,
      investorNo: row.investorNo,
      investorShortCode: row.investorShortCode,
      companyName: row.companyName,
      companyGroupCode: row.companyGroupCode,
      fundCurrencyCode: row.fundCurrencyCode,
      investorType: row.investorType,
      rowCount: 1,
    },
  });
}
