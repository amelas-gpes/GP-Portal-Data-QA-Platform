import { DATE_KEYS, EXPECTED_COLUMNS, FIELD_TO_HEADER, HEADER_TO_KEY, MONEY_KEYS, NUMERIC_KEYS, OPTIONAL_COLUMNS, REQUIRED_COLUMNS } from '../data/columns';
import type { BIRow, RowFlags, TypeIssueGroup, ValidationSeverity, ValidationSummary } from '../types';
import { toISODate } from './format';

type RawRecord = Record<string, unknown>;
type TypeIssueGroupDraft = Omit<TypeIssueGroup, 'rowCount' | 'sampleRows' | 'examples' | 'message'> & {
  sampleRows: Set<number>;
  examples: Set<string>;
};
type TypeIssueGroupAccumulator = Map<string, TypeIssueGroupDraft>;

export const IMPORT_VALIDATION_SCHEMA_VERSION = 'bi-import-review.v3';

const MIN_SUPPORTED_EXCEL_DATE_SERIAL = 25_569; // 1970-01-01
const MAX_SUPPORTED_EXCEL_DATE_SERIAL = 73_050; // 2100-01-01

export function isBlankValue(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.length === 0);
}

export function isWhitespaceOnly(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && value.trim().length === 0;
}

export function isNoneText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'none';
}

export function normalizeString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length === 0 ? null : trimmed;
}

// Single parse pipeline shared by parseNumeric and isNumericLike so the
// 400k-row import does not run the trim/paren/currency transforms twice per
// numeric cell, and the two functions cannot drift apart.
// Equivalent to /^-?\d+(\.\d+)?$/ but ~3x faster on the ~15M cells of a
// 400k-row import.
function isPlainNumberText(text: string): boolean {
  const length = text.length;
  if (length === 0) return false;
  let index = text.charCodeAt(0) === 45 ? 1 : 0; // leading '-'
  if (index >= length) return false;
  let sawDigit = false;
  let sawDot = false;
  let digitsAfterDot = false;
  for (; index < length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 48 && code <= 57) {
      if (sawDot) digitsAfterDot = true;
      else sawDigit = true;
      continue;
    }
    if (code === 46 && !sawDot && sawDigit) { // single '.' after at least one digit
      sawDot = true;
      continue;
    }
    return false;
  }
  return sawDigit && (!sawDot || digitsAfterDot);
}
// parseNumericCore runs ~30M times on a 400k-row import (once in
// normalizeBIRow, once in type validation), so it returns a primitive:
// the parsed number, 0 for blank-like cells, or NaN for invalid cells.
function parseNumericCore(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;
  if (value === null || value === undefined) return 0;
  const rawText = String(value);
  // Fast path: plain integers/decimals are the overwhelming majority of cells
  // in large exports and skip the normalization pipeline entirely.
  if (isPlainNumberText(rawText)) return Number(rawText);
  let text = rawText.trim();
  if (!text || text === '-' || text.toLowerCase() === 'none') return 0;
  let sign = 1;
  if (/^\(.*\)$/.test(text)) {
    sign = -1;
    text = text.slice(1, -1);
  }
  text = text.replace(/[$,%\s]/g, '');
  if (!text || text === '-') return 0;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed * sign : Number.NaN;
}

export function parseNumeric(value: unknown): number {
  const parsed = parseNumericCore(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function excelSerialDateToDate(serial: number): Date | null {
  if (!Number.isFinite(serial)) return null;
  const excelEpoch = Date.UTC(1899, 11, 30);
  // The integer part of an Excel serial is the calendar day; the fraction is the
  // time of day. Truncate (not round) so a timestamped serial such as 43831.75
  // (Jan 1, 6pm) stays on Jan 1 instead of rounding forward to Jan 2 and landing
  // in the wrong quarter/year bucket.
  const utcDate = new Date(excelEpoch + Math.floor(serial) * 86_400_000);
  if (Number.isNaN(utcDate.getTime())) return null;
  return new Date(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate());
}

export function isSupportedExcelDateSerial(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_SUPPORTED_EXCEL_DATE_SERIAL && value <= MAX_SUPPORTED_EXCEL_DATE_SERIAL;
}

export function isNumericLike(value: unknown): boolean {
  return !Number.isNaN(parseNumericCore(value));
}

export function parseDateValue(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') return isSupportedExcelDateSerial(value) ? excelSerialDateToDate(value) : null;
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text === '-' || text.toLowerCase() === 'none') return null;
  // Fast path: BI exports emit 'YYYY-MM-DD HH:MM:SS' for every date cell.
  // Decode it with charCodes before falling back to the regex chain.
  if (
    text.length >= 10 &&
    text.charCodeAt(4) === 45 && text.charCodeAt(7) === 45 &&
    isDigitCode(text.charCodeAt(0)) && isDigitCode(text.charCodeAt(1)) &&
    isDigitCode(text.charCodeAt(2)) && isDigitCode(text.charCodeAt(3)) &&
    isDigitCode(text.charCodeAt(5)) && isDigitCode(text.charCodeAt(6)) &&
    isDigitCode(text.charCodeAt(8)) && isDigitCode(text.charCodeAt(9))
  ) {
    const year = (text.charCodeAt(0) - 48) * 1000 + (text.charCodeAt(1) - 48) * 100 + (text.charCodeAt(2) - 48) * 10 + (text.charCodeAt(3) - 48);
    const month = (text.charCodeAt(5) - 48) * 10 + (text.charCodeAt(6) - 48);
    const day = (text.charCodeAt(8) - 48) * 10 + (text.charCodeAt(9) - 48);
    return dateFromParts(year, month, day);
  }
  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    return isSupportedExcelDateSerial(serial) ? excelSerialDateToDate(serial) : null;
  }
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, year, month, day] = iso;
    return dateFromParts(Number(year), Number(month), Number(day));
  }
  const yearFirst = text.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (yearFirst) {
    const [, year, month, day] = yearFirst;
    return dateFromParts(Number(year), Number(month), Number(day));
  }
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const [, month, day, year] = slash;
    const fullYear = year.length === 2 ? Number(`20${year}`) : Number(year);
    return dateFromParts(fullYear, Number(month), Number(day));
  }
  const monthFirst = text.match(/^(\d{1,2})[-.](\d{1,2})[-.](\d{2,4})$/);
  if (monthFirst) {
    const [, month, day, year] = monthFirst;
    const fullYear = year.length === 2 ? Number(`20${year}`) : Number(year);
    return dateFromParts(fullYear, Number(month), Number(day));
  }
  if (/^\d{1,4}[/. -]\d{1,2}[/. -]\d{1,4}/.test(text)) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isDigitCode(code: number): boolean {
  return code >= 48 && code <= 57;
}

function dateFromParts(year: number, month: number, day: number): Date | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return parsed;
}

export function getQuarter(date: Date | null): { year: number | null; quarter: number | null; label: string | null } {
  if (!date) return { year: null, quarter: null, label: null };
  const year = date.getFullYear();
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return { year, quarter, label: `${year} Q${quarter}` };
}

export function getInvestorKey(source: Pick<BIRow, 'investorNo' | 'investorShortCode' | 'companyName' | 'investorPortalDisplayName'>): string {
  if (source.investorNo || source.investorShortCode || source.companyName) {
    return `${source.investorNo ?? 'missingInvestorNo'}::${source.investorShortCode ?? 'missingShortCode'}::${source.companyName ?? 'missingCompany'}`;
  }
  return `${source.investorPortalDisplayName ?? 'missingInvestor'}::${source.companyName ?? 'missingCompany'}`;
}

export function getProgramKey(row: Pick<BIRow, 'companyGroupCode' | 'companyName'>): string {
  return row.companyGroupCode || row.companyName || 'Unassigned program';
}

export function rowHasMonetaryValue(row: BIRow): boolean {
  return MONEY_KEYS.some((key) => Math.abs(Number(row[key])) > 0);
}

export function buildRowFlags(row: BIRow): RowFlags {
  // Single pass over the money fields; this runs per row on 400k-row imports.
  let hasPositiveMoney = false;
  let hasNegativeMoney = false;
  for (const key of MONEY_KEYS) {
    const value = Number(row[key]);
    if (value > 0) hasPositiveMoney = true;
    else if (value < 0) hasNegativeMoney = true;
  }
  const capCodeRaw = row.raw['CAPCALLDIST Code'];
  const blankCap = isBlankValue(capCodeRaw) || isWhitespaceOnly(capCodeRaw);
  const nonStandardCap =
    row.capCallDistCode !== null &&
    row.capCallDistCode.toLowerCase() !== 'none' &&
    !/^[A-Z0-9][A-Z0-9 _.-]*$/i.test(row.capCallDistCode);
  return {
    hasNegativeNAV: row.endingNavGrossCarry < 0 || row.capitalAccountBalance < 0 || row.investmentsValue < 0,
    hasNegativeUnfunded: row.investorAvailableUnfundedCommitments < 0,
    hasBlankCapCallDistWithValue: blankCap && (hasPositiveMoney || hasNegativeMoney),
    hasNonStandardCapCallDist: nonStandardCap,
    hasMixedSigns: hasPositiveMoney && hasNegativeMoney,
    hasPositiveContribution: row.actualContributions > 0,
    hasNegativeDistribution: row.actualDistributions < 0,
    hasNegativeCarryPaid: row.carryPaid < 0,
  };
}

export function normalizeBIRow(raw: RawRecord, rowId: number): BIRow {
  const postingDate = parseDateValue(raw['Posting Date']);
  const quarter = getQuarter(postingDate);
  const row: BIRow = {
    rowId,
    investorKey: '',
    programKey: '',
    companyGroupCode: normalizeString(raw['Company Group Code']),
    companyName: normalizeString(raw['Company Name']),
    companySubcategoryType: normalizeString(raw['Company Subcategory Type']),
    investorType: normalizeString(raw['Investor Type']),
    investorPortalDisplayName: normalizeString(raw['Investor Portal Display Name']),
    investorGroupName: normalizeString(raw['Investor Group Name']),
    investorNo: normalizeString(raw['Investor No_']),
    investorShortCode: normalizeString(raw['Investor Short Code']),
    postingDate,
    investorTotalCommitments: parseNumeric(raw['Investor Total Commitments']),
    contributionsAffectRemainingCommitment: parseNumeric(raw['Contributions that affect remaining commitment']),
    recallableDistributions: parseNumeric(raw['Recallable Distributions']),
    waiver: parseNumeric(raw.Waiver),
    unfundedCapitalAdjustment: parseNumeric(raw['Unfunded Capital Adjustment']),
    investorAvailableUnfundedCommitments: parseNumeric(raw['Investor Available Unfunded Commitments']),
    actualContributions: parseNumeric(raw['Actual Contributions']),
    actualDistributions: parseNumeric(raw['Actual Distributions']),
    placementFees: parseNumeric(raw['Placement fee and syndication costs']),
    netInvestmentIncome: parseNumeric(raw['Net Investment Income/(Loss)']),
    realizedGain: parseNumeric(raw['Realized Investment Gain/Loss']),
    unrealizedGain: parseNumeric(raw['Unrealized Investment Gain/Loss']),
    transferOfInterest: parseNumeric(raw['Transfer of Interest']),
    capitalAccountBalance: parseNumeric(raw['Capital Account Balance']),
    carryBalance: parseNumeric(raw['Carry Balance']),
    carryTransfer: parseNumeric(raw['Carry Transfer']),
    endingNavGrossCarry: parseNumeric(raw['Ending NAV - Gross Carry']),
    carryRealized: parseNumeric(raw['Carry Realized']),
    carryUnrealized: parseNumeric(raw['Carry Unrealized']),
    carryPaid: parseNumeric(raw['Carry Paid']),
    itdContributions: parseNumeric(raw['ITD Contributions']),
    itdGrossContributions: parseNumeric(raw['ITD Gross Contributions']),
    investmentsValue: parseNumeric(raw['Investments Value']),
    capCallDistCode: normalizeString(raw['CAPCALLDIST Code']),
    totalContributions: parseNumeric(raw['Total Contributions']),
    totalDistributions: parseNumeric(raw['Total Distributions']),
    investmentStrategy: normalizeString(raw['Investment Strategy']),
    accountingBasis: normalizeString(raw['Accounting Basis']),
    fundCurrencyCode: normalizeString(raw['Fund Currency Code']),
    auditor: normalizeString(raw.Auditor),
    managementFeePctDuringIP: parseNumeric(raw['Investor Mgt Fee Pct During IP']),
    managementFeePctThereafter: parseNumeric(raw['Investor Mgt Fee Pct Thereafter']),
    managementFeePctThereafterDescription: normalizeString(raw['Investor Mgt Fee % Thereafter Description']),
    modelType: normalizeString(raw['Model Type']),
    carriedInterestPct: parseNumeric(raw['Investor Carried Interest Pct']),
    carriedInterestPctDescription: normalizeString(raw['Investor Carried Interest % Description']),
    hurdleRatePreferredReturn: parseNumeric(raw['Investor Hurdle Rate or Preferred Return']),
    hurdleRatePreferredReturnDescription: normalizeString(raw['Investor Hurdle Rate/Preferred Return Description']),
    investorSideLetterDate: parseDateValue(raw['Investor Side Letter Date']),
    dateMostRecentPartnershipAgreement: parseDateValue(raw['Date of most recent partnership agreement']),
    dateOperationsCommenced: parseDateValue(raw['Date operations commenced']),
    investmentCost: parseNumeric(raw['Investment Cost']),
    investmentRealizedDistribution: parseNumeric(raw['Investment Realized Distribution']),
    specialProfits: parseNumeric(raw['Special Profits']),
    partnerTransfer: parseNumeric(raw['Partner Transfer']),
    partnerTransferInvestmentActivity: parseNumeric(raw['Partner Transfer Investment Activity']),
    partnerTransferContribution: parseNumeric(raw['Partner Transfer Contribution']),
    actualInvestmentActivity: parseNumeric(raw['Actual Investment Activity']),
    postingYear: quarter.year,
    postingQuarter: quarter.quarter,
    postingQuarterLabel: quarter.label,
    flags: EMPTY_ROW_FLAGS,
    raw,
  };
  row.investorKey = getInvestorKey(row);
  row.programKey = getProgramKey(row);
  row.flags = buildRowFlags(row);
  return row;
}

const EMPTY_ROW_FLAGS: RowFlags = Object.freeze({
  hasNegativeNAV: false,
  hasNegativeUnfunded: false,
  hasBlankCapCallDistWithValue: false,
  hasNonStandardCapCallDist: false,
  hasMixedSigns: false,
  hasPositiveContribution: false,
  hasNegativeDistribution: false,
  hasNegativeCarryPaid: false,
});

export function validateHeaders(headers: string[], sheetName: string, rowCount: number): ValidationSummary {
  const normalizedHeaders = headers.map((header) => String(header).trim());
  const lowerCaseHeaders = normalizedHeaders.map((header) => header.toLowerCase());
  const duplicateColumns = duplicatedHeaders(normalizedHeaders);
  const missingColumns = REQUIRED_COLUMNS.filter((header) => !normalizedHeaders.includes(header));
  const missingOptionalColumns = OPTIONAL_COLUMNS.filter((header) => !normalizedHeaders.includes(header));
  const extraColumns = normalizedHeaders.filter((header) => header && !EXPECTED_COLUMNS.includes(header as (typeof EXPECTED_COLUMNS)[number]));
  const missingColumnIssues = missingColumns.map((column) => ({
    column,
    severity: 'error' as const,
    message: `${column} is required by the BI import schema and may affect chart calculations.`,
  }));
  const optionalColumnIssues = missingOptionalColumns.map((column) => ({
    column,
    severity: 'warning' as const,
    message: `${column} is not in this file. Investor names fall back to Investor Group Name.`,
  }));
  const extraColumnIssues = extraColumns.map((column) => ({
    column,
    severity: 'warning' as const,
    message: `${column} is not part of the current BI import schema and is retained only as raw source data.`,
  }));
  const duplicateColumnIssues = duplicateColumns.map((column) => ({
    column,
    severity: 'error' as const,
    message: `${column} appears more than once. Duplicate headers make raw values ambiguous and can affect chart calculations.`,
  }));
  return {
    schemaVersion: IMPORT_VALIDATION_SCHEMA_VERSION,
    sheetName,
    headers: normalizedHeaders,
    normalizedHeaders: lowerCaseHeaders,
    severity: resolveValidationSeverity(missingColumnIssues.length, extraColumnIssues.length + optionalColumnIssues.length, 0, 0, duplicateColumnIssues.length),
    missingColumns,
    extraColumns,
    duplicateColumns,
    missingColumnIssues,
    extraColumnIssues,
    duplicateColumnIssues,
    optionalColumnIssues,
    typeIssues: [],
    typeIssueGroups: [],
    rowCount,
    rowCountReconciliation: reconcileRowCounts(rowCount, rowCount, 0),
    timing: {
      sourceKind: 'excel',
      readMs: 0,
      parseMs: 0,
      normalizeMs: 0,
      scenarioMs: 0,
      totalMs: 0,
    },
  };
}

export function collectTypeIssues(rows: BIRow[], limit = 25): string[] {
  const issues: string[] = [];
  for (const row of rows) {
    appendTypeIssuesForRow(row, issues, limit);
    if (issues.length >= limit) break;
  }
  return issues;
}

export function createTypeIssueGroupAccumulator(): TypeIssueGroupAccumulator {
  return new Map();
}

export function collectTypeIssueGroups(rows: BIRow[]): TypeIssueGroup[] {
  const groups = createTypeIssueGroupAccumulator();
  for (const row of rows) {
    appendTypeIssuesForRow(row, [], 0, groups);
  }
  return finalizeTypeIssueGroups(groups);
}

export function appendTypeIssuesForRow(
  row: BIRow,
  issues: string[],
  limit = 25,
  groups?: TypeIssueGroupAccumulator,
): void {
  if (issues.length >= limit && !groups) return;
  for (const key of DATE_KEYS) {
    const header = FIELD_TO_HEADER[key];
    const raw = row.raw[header];
    if (!row[key] && !isNullStoragePlaceholder(raw)) {
      recordTypeIssue({
        row,
        issues,
        limit,
        groups,
        fieldKey: key,
        header,
        kind: 'date',
        severity: 'warning',
        raw,
        message: `Row ${row.rowId}: ${header} could not be parsed as a date and was stored as empty.`,
      });
      if (issues.length >= limit && !groups) return;
    }
  }
  for (const key of NUMERIC_KEYS) {
    const header = FIELD_TO_HEADER[key];
    const raw = row.raw[header];
    if (row[key] !== 0) continue; // non-zero normalized values parsed successfully by construction
    if (typeof raw === 'number' && Number.isFinite(raw)) continue; // finite numbers are always numeric-like
    if (!isNullStoragePlaceholder(raw) && !isNumericLike(raw)) {
      recordTypeIssue({
        row,
        issues,
        limit,
        groups,
        fieldKey: key,
        header,
        kind: 'number',
        severity: 'error',
        raw,
        message: `Row ${row.rowId}: ${header} expects a number but contains "${formatIssueExample(raw)}".`,
      });
      if (issues.length >= limit && !groups) return;
    }
  }
}

export function blockingTypeIssueGroups(groups: TypeIssueGroup[]): TypeIssueGroup[] {
  return groups.filter((group) => group.severity === 'error');
}

export function formatBlockingTypeIssueProof(groups: TypeIssueGroup[]): string {
  const blockingGroups = blockingTypeIssueGroups(groups);
  const issueCount = blockingGroups.reduce((sum, group) => sum + group.rowCount, 0);
  const preview = blockingGroups
    .slice(0, 3)
    .map((group) => {
      const rowLabel = group.sampleRows.length ? `rows ${group.sampleRows.join(', ')}` : 'sample rows unavailable';
      const examples = group.examples.length ? ` examples: ${group.examples.join(', ')}` : '';
      return `${group.header} (${rowLabel}${examples})`;
    })
    .join('; ');
  const hiddenCount = Math.max(0, blockingGroups.length - 3);
  const hiddenLabel = hiddenCount ? `; ${hiddenCount.toLocaleString()} more numeric field${hiddenCount === 1 ? '' : 's'}` : '';
  return `${issueCount.toLocaleString()} text value${issueCount === 1 ? '' : 's'} found in numeric columns: ${preview}${hiddenLabel}.`;
}

export function hasBlockingTypeIssues(groups: TypeIssueGroup[]): boolean {
  return blockingTypeIssueGroups(groups).length > 0;
}

function isNullStoragePlaceholder(value: unknown): boolean {
  return isBlankValue(value) || isWhitespaceOnly(value) || isNoneText(value);
}

function recordTypeIssue({
  row,
  issues,
  limit,
  groups,
  fieldKey,
  header,
  kind,
  severity,
  raw,
  message,
}: {
  row: BIRow;
  issues: string[];
  limit: number;
  groups?: TypeIssueGroupAccumulator;
  fieldKey: string;
  header: string;
  kind: TypeIssueGroup['kind'];
  severity: TypeIssueGroup['severity'];
  raw: unknown;
  message: string;
}): void {
  if (issues.length < limit) {
    issues.push(message);
  }
  if (!groups) return;
  const key = `${kind}:${header}`;
  const existing = groups.get(key) ?? {
    fieldKey,
    header,
    kind,
    severity,
    sampleRows: new Set<number>(),
    examples: new Set<string>(),
  };
  existing.sampleRows.add(row.rowId);
  if (severity === 'error') existing.severity = severity;
  if (existing.examples.size < 3) {
    existing.examples.add(formatIssueExample(raw));
  }
  groups.set(key, existing);
}

function formatIssueExample(value: unknown): string {
  const text = String(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

export function rowDateISO(row: BIRow): string | null {
  return toISODate(row.postingDate);
}

export const KNOWN_IMPORT_FIELDS = new Set(Object.keys(HEADER_TO_KEY));

export function finalizeTypeIssueGroups(groups: TypeIssueGroupAccumulator): TypeIssueGroup[] {
  return Array.from(groups.values())
    .map((group) => {
      const sampleRows = Array.from(group.sampleRows).sort((a, b) => a - b);
      const examples = Array.from(group.examples);
      const rowCount = sampleRows.length;
      const typeLabel = group.kind === 'date' ? 'dates' : 'numbers';
      return {
        fieldKey: group.fieldKey,
        header: group.header,
        kind: group.kind,
        severity: group.severity,
        rowCount,
        sampleRows: sampleRows.slice(0, 8),
        examples: examples.slice(0, 3),
        message: `${group.header} has ${rowCount.toLocaleString()} value${rowCount === 1 ? '' : 's'} that could not be parsed as ${typeLabel}.`,
      };
    })
    .sort((a, b) => b.rowCount - a.rowCount || a.header.localeCompare(b.header));
}

export function reconcileRowCounts(sourceRows: number, importedRows: number, blankRowsSkipped: number): ValidationSummary['rowCountReconciliation'] {
  const rejectedRows = Math.max(0, sourceRows - importedRows - blankRowsSkipped);
  if (rejectedRows > 0) {
    return {
      sourceRows,
      importedRows,
      blankRowsSkipped,
      rejectedRows,
      status: 'mismatch',
      message: `${importedRows.toLocaleString()} of ${sourceRows.toLocaleString()} source rows were indexed; ${rejectedRows.toLocaleString()} row${rejectedRows === 1 ? '' : 's'} could not be reconciled.`,
    };
  }
  if (blankRowsSkipped > 0) {
    return {
      sourceRows,
      importedRows,
      blankRowsSkipped,
      rejectedRows,
      status: 'skipped_blank_rows',
      message: `${importedRows.toLocaleString()} populated row${importedRows === 1 ? '' : 's'} indexed; ${blankRowsSkipped.toLocaleString()} blank row${blankRowsSkipped === 1 ? '' : 's'} skipped.`,
    };
  }
  return {
    sourceRows,
    importedRows,
    blankRowsSkipped,
    rejectedRows,
    status: 'matched',
    message: `${importedRows.toLocaleString()} source row${importedRows === 1 ? '' : 's'} indexed with no row-count drift.`,
  };
}

export function resolveValidationSeverity(
  missingColumnCount: number,
  extraColumnCount: number,
  typeIssueGroupCount: number,
  rejectedRows: number,
  duplicateColumnCount = 0,
  blockingTypeIssueGroupCount = 0,
): ValidationSeverity {
  if (missingColumnCount > 0 || duplicateColumnCount > 0 || rejectedRows > 0 || blockingTypeIssueGroupCount > 0) return 'error';
  if (extraColumnCount > 0 || typeIssueGroupCount > 0) return 'warning';
  return 'ok';
}

function duplicatedHeaders(headers: string[]): string[] {
  const firstByKey = new Map<string, string>();
  const duplicates = new Set<string>();
  for (const header of headers) {
    if (!header) continue;
    const key = header.toLowerCase();
    const firstHeader = firstByKey.get(key);
    if (firstHeader) duplicates.add(firstHeader);
    else firstByKey.set(key, header);
  }
  return Array.from(duplicates).sort((a, b) => a.localeCompare(b));
}
