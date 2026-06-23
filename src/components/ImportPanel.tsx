import { CheckCircle2, FileSpreadsheet, RefreshCw, UploadCloud, X, XCircle } from 'lucide-react';
import { useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useModalFocus } from '../hooks/useModalFocus';
import type { ImportFingerprintV2, ImportProgress, ImportSummary, RowCountReconciliation, TypeIssueGroup, ValidationSeverity } from '../types';
import { Pill } from './common';

export function ImportDropZone({
  actionHint = 'Excel .xlsx/.xls or CSV',
  chooseButtonTitle = 'Choose an Excel or CSV file from your computer.',
  chooseFileButtonRef,
  className = '',
  detail,
  dropZoneTitle = 'Drop an Excel workbook or CSV file here to start.',
  eyebrow,
  heading,
  inputRef,
  isImporting,
  onImport,
  primaryLabel,
}: {
  actionHint?: string;
  chooseButtonTitle?: string;
  chooseFileButtonRef?: RefObject<HTMLButtonElement | null>;
  className?: string;
  detail: string;
  dropZoneTitle?: string;
  eyebrow: string;
  heading: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  isImporting: boolean;
  onImport: (file: File) => void;
  primaryLabel: string;
}) {
  const fallbackInputRef = useRef<HTMLInputElement | null>(null);
  const fallbackButtonRef = useRef<HTMLButtonElement | null>(null);
  const resolvedInputRef = inputRef ?? fallbackInputRef;
  const resolvedButtonRef = chooseFileButtonRef ?? fallbackButtonRef;
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (isImporting) return;
    const file = files?.[0];
    if (file) onImport(file);
    if (resolvedInputRef.current) resolvedInputRef.current.value = '';
  };

  return (
    <>
      <div
        className={`import-drop-zone ${dragging ? 'dragging' : ''} ${isImporting ? 'disabled' : ''} ${className}`.trim()}
        title={dropZoneTitle}
        onDragOver={(event) => {
          event.preventDefault();
          if (!isImporting) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
      >
        <div className="import-drop-main">
          <div className="import-icon import-icon-large">
            <UploadCloud size={28} />
          </div>
          <div className="import-drop-copy">
            <span className="import-drop-eyebrow">{eyebrow}</span>
            <h3>{heading}</h3>
            <p>{detail}</p>
          </div>
        </div>
        <div className="import-drop-actions">
          <button ref={resolvedButtonRef} className="primary-button import-primary-action" type="button" onClick={() => resolvedInputRef.current?.click()} disabled={isImporting} title={chooseButtonTitle}>
            <FileSpreadsheet size={16} />
            {primaryLabel}
          </button>
          <span>{actionHint}</span>
        </div>
      </div>

      <input ref={resolvedInputRef} type="file" accept=".xlsx,.xls,.csv,text/csv" hidden title="Choose an Excel or CSV file to import." onChange={(event) => handleFiles(event.target.files)} />
    </>
  );
}

export function ImportModal({
  summary,
  isImporting,
  importProgress,
  error,
  recoverableError,
  hasRetryFile,
  requiresReimport = false,
  importFingerprint,
  onImport,
  onCancelImport,
  onRecoverImport,
  onReloadApp,
  onClose,
}: {
  summary: ImportSummary | null;
  isImporting: boolean;
  importProgress: ImportProgress | null;
  error: string | null;
  recoverableError: boolean;
  hasRetryFile: boolean;
  requiresReimport?: boolean;
  importFingerprint: ImportFingerprintV2 | null;
  onImport: (file: File) => void;
  onCancelImport: () => void;
  onRecoverImport: () => void;
  onReloadApp: () => void;
  onClose: () => void;
}) {
  const headingId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const chooseFileButtonRef = useRef<HTMLButtonElement | null>(null);
  const { modalRef, handleModalKeyDown } = useModalFocus<HTMLElement>({
    closeOnEscape: !isImporting,
    initialFocusRef: chooseFileButtonRef,
    onClose,
  });

  const activeFileName = importFingerprint?.fileName ?? summary?.fileName ?? 'the previous file';
  const modalTitle = requiresReimport ? 'Reconnect source file' : summary ? 'Replace data' : 'Import data';
  const modalSubtitle = requiresReimport
    ? `${activeFileName} is needed to restore rows.`
    : summary
      ? `${summary.fileName} is loaded.`
      : 'Choose an Excel workbook or CSV.';
  const dropTitle = requiresReimport ? 'Choose source file' : summary ? 'Choose replacement' : 'Choose file';
  const dropDetail = requiresReimport
    ? 'Use the same file to reconnect the saved review.'
    : summary
      ? 'The new file will replace the current data.'
      : 'Drag a file here or choose one from your computer.';
  const primaryLabel = isImporting ? 'Importing...' : requiresReimport ? 'Choose source file' : summary ? 'Choose replacement' : 'Choose file';

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      title={requiresReimport ? 'Choose the workbook again so restored settings can reconnect to local rows.' : summary ? 'Replace the workbook currently powering the QA workbench.' : 'Import a workbook or CSV to populate the QA workbench.'}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isImporting) onClose();
      }}
    >
      <section
        className="import-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        onKeyDown={handleModalKeyDown}
        title="Imports are read locally in the browser and used to recalculate the workbench."
      >
        <header className="import-modal-header">
          <div>
            <h2 id={headingId}>{modalTitle}</h2>
            <span>{modalSubtitle}</span>
          </div>
          <button className="icon-button" type="button" aria-label="Close import modal" onClick={onClose} disabled={isImporting} title="Close the import dialog.">
            <X size={16} />
          </button>
        </header>

        <ImportDropZone
          chooseButtonTitle={summary ? 'Choose a replacement file from your computer.' : 'Choose an Excel or CSV file from your computer.'}
          chooseFileButtonRef={chooseFileButtonRef}
          detail={dropDetail}
          dropZoneTitle={summary ? 'Drop a replacement workbook or CSV file here.' : 'Drop an Excel workbook or CSV file here to start.'}
          eyebrow={summary ? 'File import' : 'First step'}
          heading={dropTitle}
          inputRef={inputRef}
          isImporting={isImporting}
          onImport={onImport}
          primaryLabel={primaryLabel}
        />

        <div className="import-privacy-note" title="The selected file is processed in this browser session.">
          <CheckCircle2 size={15} />
          <span>Local only: your file is read in this browser and is not uploaded.</span>
        </div>

        {/* While importing, show live progress at the top of the body so the
            indicator is always in view. The summary + validation review below
            describe the PREVIOUS file, so they are hidden mid-import to avoid a
            stale, "nothing is happening" modal (they pushed progress below the
            scroll fold on shorter viewports). */}
        {isImporting ? <ImportProgressPanel progress={importProgress} onCancel={onCancelImport} /> : null}

        {!isImporting && summary ? (
          <div className="import-modal-current" title="Summary of the workbook currently loaded in the workbench.">
            <div className="loaded-import-copy">
              <div className="import-icon compact">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <strong>{summary.fileName}</strong>
                <span>{requiresReimport ? `${summary.totalRows.toLocaleString()} rows from restored metadata` : `${summary.totalRows.toLocaleString()} rows indexed locally`}</span>
              </div>
            </div>
            <div className="validation-grid compact">
              <Pill tone={toneForSeverity(summary.validation.severity)}>
                {summary.validation.schemaVersion ?? 'Schema review'}
              </Pill>
              <Pill tone={summary.validation.missingColumns.length ? 'bad' : 'good'}>
                {summary.validation.missingColumns.length ? `${summary.validation.missingColumns.length} missing` : 'Columns ok'}
              </Pill>
              <Pill tone={summary.validation.typeIssues.length ? 'warn' : 'good'}>{formatTypeIssueCount(summary.validation.typeIssueGroups, summary.validation.typeIssues.length)}</Pill>
            </div>
          </div>
        ) : null}

        {!isImporting && summary ? <ImportValidationReview summary={summary} importFingerprint={importFingerprint} requiresReimport={requiresReimport} /> : null}
        {error && recoverableError ? (
          <ImportRecoveryCard
            message={error}
            hasRetryFile={hasRetryFile}
            onRecover={onRecoverImport}
            onReload={onReloadApp}
          />
        ) : null}
        {error && !recoverableError ? <ImportErrorCard message={error} onChooseFile={() => inputRef.current?.click()} /> : null}
      </section>
    </div>
  );
}

function ImportValidationReview({
  summary,
  importFingerprint,
  requiresReimport,
}: {
  summary: ImportSummary;
  importFingerprint: ImportFingerprintV2 | null;
  requiresReimport: boolean;
}) {
  const validation = summary.validation;
  const typeIssueGroups = validation.typeIssueGroups ?? [];
  const rowCountReconciliation = validation.rowCountReconciliation ?? fallbackRowCountReconciliation(summary.totalRows, validation.rowCount);
  const sourceKind = validation.timing?.sourceKind ?? importFingerprint?.sourceKind ?? 'unknown';
  const timing = validation.timing;
  const missingColumnIssues = validation.missingColumnIssues ?? validation.missingColumns.map((column) => ({ column, severity: 'error' as const, message: `${column} is missing.` }));
  const optionalColumnIssues = validation.optionalColumnIssues ?? [];
  const extraColumnIssues = validation.extraColumnIssues ?? validation.extraColumns.map((column) => ({ column, severity: 'warning' as const, message: `${column} is outside the expected schema.` }));
  const duplicateColumnIssues = validation.duplicateColumnIssues ?? (validation.duplicateColumns ?? []).map((column) => ({ column, severity: 'error' as const, message: `${column} appears more than once.` }));
  const typeIssueCount = countGroupedTypeIssues(typeIssueGroups, validation.typeIssues.length);
  const severity = validation.severity ?? inferValidationSeverity(missingColumnIssues.length, extraColumnIssues.length, typeIssueCount, rowCountReconciliation.rejectedRows, duplicateColumnIssues.length);
  const timingLabel = timing ? `${formatSourceKind(sourceKind)} ${formatTiming(timing.totalMs)} total` : `${formatSourceKind(sourceKind)} timing unavailable`;
  const validationItems = buildValidationItems({
    duplicateColumnIssues,
    extraColumnIssues,
    missingColumnIssues,
    optionalColumnIssues,
    rowCountReconciliation,
    typeIssueCount,
    typeIssueGroups,
  });

  return (
    <section className={`validation-summary-card validation-summary-${severity}`} title="Import validation review covering columns, rows, values, and local processing time.">
      <header className="validation-summary-header">
        <div className="import-icon compact">
          <CheckCircle2 size={18} />
        </div>
        <div>
          <strong>{formatValidationHeadline(severity, requiresReimport)}</strong>
          <span>{formatValidationDetail(severity, requiresReimport, summary.totalRows, rowCountReconciliation)}</span>
        </div>
      </header>

      <div className="validation-grid validation-grid-readable">
        <Pill tone={toneForSeverity(severity)} title="Overall import review status.">
          {formatSeverityLabel(severity)}
        </Pill>
        <Pill tone={rowCountTone(rowCountReconciliation)} title={rowCountReconciliation.message}>
          {formatRowCountReconciliation(rowCountReconciliation)}
        </Pill>
        <Pill tone={typeIssueTone(typeIssueGroups, typeIssueCount)} title={typeIssueGroups.length ? formatTypeIssuePreview(typeIssueGroups) : 'Dates and numbers were readable.'}>
          {formatTypeIssueCount(typeIssueGroups, validation.typeIssues.length)}
        </Pill>
        <Pill tone="neutral" title={timing ? formatTimingTitle(timing) : 'Timing was not captured for this import.'}>
          {timingLabel}
        </Pill>
      </div>

      <div className="validation-summary-list">
        {validationItems.map((item) => (
          <div className={`validation-summary-item ${item.tone}`} key={item.label} title={item.title}>
            <span className="validation-status-dot" aria-hidden="true" />
            <div>
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
            </div>
          </div>
        ))}
      </div>

      <span className="validation-file">
        {requiresReimport ? 'Saved session found. Choose the same file above to reconnect the rows.' : `${summary.fileName} reviewed on ${validation.sheetName}.`}
      </span>
    </section>
  );
}

type ValidationTone = 'neutral' | 'good' | 'warn' | 'bad';

type ValidationSummaryItem = {
  detail: ReactNode;
  label: string;
  title: string;
  tone: ValidationTone;
};

function buildValidationItems({
  duplicateColumnIssues,
  extraColumnIssues,
  missingColumnIssues,
  optionalColumnIssues,
  rowCountReconciliation,
  typeIssueCount,
  typeIssueGroups,
}: {
  duplicateColumnIssues: Array<{ column: string; message: string }>;
  extraColumnIssues: Array<{ column: string; message: string }>;
  missingColumnIssues: Array<{ column: string; message: string }>;
  optionalColumnIssues: Array<{ column: string; message: string }>;
  rowCountReconciliation: RowCountReconciliation;
  typeIssueCount: number;
  typeIssueGroups: TypeIssueGroup[];
}): ValidationSummaryItem[] {
  return [
    {
      label: 'Required columns',
      tone: missingColumnIssues.length ? 'bad' : 'good',
      detail: missingColumnIssues.length
        ? `Missing ${formatColumnPreview(missingColumnIssues.map((issue) => issue.column))}. Add these columns and import again.`
        : 'All required BI columns were found.',
      title: formatColumnIssueTitle(missingColumnIssues.map((issue) => issue.message), 'Required columns are present.'),
    },
    ...(optionalColumnIssues.length
      ? [{
        label: 'Optional columns',
        tone: 'warn' as const,
        detail: `${formatColumnPreview(optionalColumnIssues.map((issue) => issue.column))} not in this file. Investor names fall back to Investor Group Name.`,
        title: formatColumnIssueTitle(optionalColumnIssues.map((issue) => issue.message), 'Optional columns are present.'),
      }]
      : []),
    {
      label: 'Duplicate headers',
      tone: duplicateColumnIssues.length ? 'bad' : 'good',
      detail: duplicateColumnIssues.length
        ? `Keep one header for ${formatColumnPreview(duplicateColumnIssues.map((issue) => issue.column))}, then import again.`
        : 'No duplicate column names were found.',
      title: formatColumnIssueTitle(duplicateColumnIssues.map((issue) => issue.message), 'No duplicate headers found.'),
    },
    {
      label: 'Rows',
      tone: rowCountTone(rowCountReconciliation),
      detail: formatRowCountDetail(rowCountReconciliation),
      title: rowCountReconciliation.message,
    },
    {
      label: 'Dates and numbers',
      tone: typeIssueTone(typeIssueGroups, typeIssueCount),
      detail: typeIssueCount ? formatTypeIssueDetail(typeIssueGroups, typeIssueCount) : 'Dates and numbers were readable.',
      title: typeIssueGroups.length ? formatTypeIssuePreview(typeIssueGroups) : 'No type parsing issues found.',
    },
    {
      label: 'Extra columns',
      tone: extraColumnIssues.length ? 'warn' : 'neutral',
      detail: extraColumnIssues.length
        ? `${formatColumnPreview(extraColumnIssues.map((issue) => issue.column))} will stay available in the raw data view, but is outside the expected BI schema.`
        : 'No unexpected columns were found.',
      title: formatColumnIssueTitle(extraColumnIssues.map((issue) => issue.message), 'No extra columns found.'),
    },
  ];
}

function ImportRecoveryCard({
  message,
  hasRetryFile,
  onRecover,
  onReload,
}: {
  message: string;
  hasRetryFile: boolean;
  onRecover: () => void;
  onReload: () => void;
}) {
  const friendly = formatImportError(message);
  return (
    <div className="import-recovery-card" role="alert" title="Recover from a local import issue without sending data outside the browser.">
      <div className="import-recovery-icon">
        <RefreshCw size={18} />
      </div>
      <div className="import-recovery-copy">
        <strong>{friendly.title}</strong>
        <span>
          {hasRetryFile
            ? 'Restart the local importer and retry the file you just selected. Your current dashboard data stays in place.'
            : 'Restart the local importer, then choose the file again. Your current dashboard data stays in place.'}
        </span>
        <small>{friendly.detail}</small>
      </div>
      <div className="import-recovery-actions">
        <button className="primary-button" type="button" onClick={onRecover} title="Restart the local importer and retry the last file when available.">
          <RefreshCw size={15} /> {hasRetryFile ? 'Restart and retry' : 'Restart importer'}
        </button>
        <button className="icon-text-button" type="button" onClick={onReload} title="Refresh the app if the importer cannot recover cleanly.">
          Refresh app
        </button>
      </div>
    </div>
  );
}

function ImportErrorCard({ message, onChooseFile }: { message: string; onChooseFile: () => void }) {
  const friendly = formatImportError(message);
  return (
    <div className="import-error-card" role="alert" title="The import could not finish. Choose a corrected file to try again.">
      <div className="import-error-icon">
        <XCircle size={18} />
      </div>
      <div className="import-error-copy">
        <strong>{friendly.title}</strong>
        <span>{friendly.detail}</span>
        <small>{friendly.nextStep}</small>
      </div>
      <button className="primary-button" type="button" onClick={onChooseFile} title="Choose another Excel or CSV file.">
        <FileSpreadsheet size={15} /> Choose another file
      </button>
    </div>
  );
}

function toneForSeverity(severity: ValidationSeverity | undefined): ValidationTone {
  if (severity === 'error') return 'bad';
  if (severity === 'warning') return 'warn';
  if (severity === 'ok') return 'good';
  return 'neutral';
}

function typeIssueTone(groups: TypeIssueGroup[], fallbackCount: number): ValidationTone {
  if (groups.some((group) => group.severity === 'error')) return 'bad';
  return countGroupedTypeIssues(groups, fallbackCount) ? 'warn' : 'good';
}

function inferValidationSeverity(missingColumnCount: number, extraColumnCount: number, typeIssueCount: number, rejectedRows: number, duplicateColumnCount = 0): ValidationSeverity {
  if (missingColumnCount > 0 || duplicateColumnCount > 0 || rejectedRows > 0) return 'error';
  if (extraColumnCount > 0 || typeIssueCount > 0) return 'warning';
  return 'ok';
}

function formatValidationHeadline(severity: ValidationSeverity, requiresReimport: boolean): string {
  if (requiresReimport) return 'Saved review found';
  if (severity === 'error') return 'Import needs attention';
  if (severity === 'warning') return 'Import finished with notes';
  return 'Import complete';
}

function formatValidationDetail(
  severity: ValidationSeverity,
  requiresReimport: boolean,
  totalRows: number,
  reconciliation: RowCountReconciliation,
): string {
  if (requiresReimport) return 'Choose the source file above so the saved filters and chart settings can use the row data again.';
  if (severity === 'error') return 'The file was read, but a few items need correction before the review can be trusted.';
  if (severity === 'warning') return `${totalRows.toLocaleString()} rows are ready. Review the notes below before relying on comparisons.`;
  if (reconciliation.status === 'skipped_blank_rows') return `${totalRows.toLocaleString()} rows are ready after skipping blank lines.`;
  return `${totalRows.toLocaleString()} rows are ready for QA.`;
}

function formatSeverityLabel(severity: ValidationSeverity): string {
  if (severity === 'error') return 'Needs attention';
  if (severity === 'warning') return 'Notes found';
  return 'Ready';
}

function formatTypeIssueCount(groups: TypeIssueGroup[] | undefined, fallbackCount: number): string {
  const groupedCount = countGroupedTypeIssues(groups ?? [], fallbackCount);
  if (!groupedCount) return 'Types clean';
  const fieldCount = groups?.length ?? 0;
  const countLabel = groupedCount.toLocaleString();
  return fieldCount ? `${countLabel} type issue${groupedCount === 1 ? '' : 's'} in ${fieldCount} field${fieldCount === 1 ? '' : 's'}` : `${countLabel} type issue${groupedCount === 1 ? '' : 's'}`;
}

function countGroupedTypeIssues(groups: TypeIssueGroup[], fallbackCount: number): number {
  const groupedCount = groups.reduce((sum, group) => sum + group.rowCount, 0);
  return groupedCount || fallbackCount;
}

function fallbackRowCountReconciliation(totalRows: number, validationRowCount: number): RowCountReconciliation {
  return {
    sourceRows: validationRowCount || totalRows,
    importedRows: totalRows,
    blankRowsSkipped: 0,
    rejectedRows: Math.max(0, (validationRowCount || totalRows) - totalRows),
    status: validationRowCount && validationRowCount !== totalRows ? 'mismatch' : 'matched',
    message: `${totalRows.toLocaleString()} row${totalRows === 1 ? '' : 's'} indexed.`,
  };
}

function rowCountTone(reconciliation: RowCountReconciliation): ValidationTone {
  if (reconciliation.status === 'mismatch') return 'bad';
  if (reconciliation.status === 'skipped_blank_rows') return 'warn';
  return 'good';
}

function formatRowCountReconciliation(reconciliation: RowCountReconciliation): string {
  if (reconciliation.status === 'mismatch') return `${reconciliation.rejectedRows.toLocaleString()} rows unreconciled`;
  if (reconciliation.status === 'skipped_blank_rows') return `${reconciliation.importedRows.toLocaleString()} rows, ${reconciliation.blankRowsSkipped.toLocaleString()} blank skipped`;
  return `${reconciliation.importedRows.toLocaleString()} rows reconciled`;
}

function formatRowCountDetail(reconciliation: RowCountReconciliation): string {
  if (reconciliation.status === 'mismatch') {
    return `${reconciliation.rejectedRows.toLocaleString()} source row${reconciliation.rejectedRows === 1 ? '' : 's'} could not be matched to imported rows. Check for malformed or partially filled rows.`;
  }
  if (reconciliation.status === 'skipped_blank_rows') {
    return `${reconciliation.blankRowsSkipped.toLocaleString()} blank row${reconciliation.blankRowsSkipped === 1 ? '' : 's'} skipped. ${reconciliation.importedRows.toLocaleString()} rows are ready.`;
  }
  return `${reconciliation.importedRows.toLocaleString()} rows matched the source count.`;
}

function formatTypeIssueDetail(groups: TypeIssueGroup[], fallbackCount: number): string {
  const count = countGroupedTypeIssues(groups, fallbackCount);
  if (!groups.length) return `${count.toLocaleString()} value${count === 1 ? '' : 's'} need review.`;
  const firstGroup = groups[0];
  const sampleRows = firstGroup.sampleRows.length ? ` Sample rows: ${firstGroup.sampleRows.join(', ')}.` : '';
  return `${count.toLocaleString()} date or number value${count === 1 ? '' : 's'} need review across ${groups.length.toLocaleString()} field${groups.length === 1 ? '' : 's'}. Start with ${firstGroup.header}.${sampleRows}`;
}

function formatTypeIssuePreview(groups: TypeIssueGroup[]): string {
  return groups
    .slice(0, 3)
    .map((group) => `${group.header}: ${group.message}${group.sampleRows.length ? ` Sample rows ${group.sampleRows.join(', ')}` : ''}${group.examples.length ? ` Examples ${group.examples.join(', ')}` : ''}.`)
    .join(' ');
}

function formatSourceKind(sourceKind: string): string {
  if (sourceKind === 'csv') return 'CSV';
  if (sourceKind === 'excel' || sourceKind === 'workbook') return 'Excel';
  return sourceKind.charAt(0).toUpperCase() + sourceKind.slice(1);
}

function formatTiming(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatTimingTitle(timing: ImportSummary['validation']['timing']): string {
  return `Read ${formatTiming(timing.readMs)}, parsed ${formatTiming(timing.parseMs)}, normalized ${formatTiming(timing.normalizeMs)}, scenarios ${formatTiming(timing.scenarioMs)}.`;
}

function formatColumnIssueTitle(messages: string[], fallback: string): string {
  if (!messages.length) return fallback;
  return messages.slice(0, 4).join(' ');
}

function formatColumnPreview(columns: string[]): string {
  if (columns.length <= 4) return columns.join(', ');
  return `${columns.slice(0, 4).join(', ')} and ${columns.length - 4} more`;
}

function formatImportError(message: string): { detail: string; nextStep: string; title: string } {
  const normalized = message.toLowerCase();
  if (normalized.includes('import rejected: number columns contain text')) {
    return {
      title: 'Fix number values before import',
      detail: message.replace(/^Import rejected:\s*/i, ''),
      nextStep: 'Text belongs in text columns. Number columns can use blank cells, dashes, zero, regular numbers, minus negatives, and parenthesized negatives.',
    };
  }
  if (normalized.includes('unclosed quoted field')) {
    return {
      title: 'The CSV needs a quick cleanup',
      detail: 'One row has a quote that never closes, so the app cannot tell where that field ends.',
      nextStep: 'Export the CSV again, or open it in Excel and save a fresh copy before importing.',
    };
  }
  if (normalized.includes('does not contain any worksheets')) {
    return {
      title: 'This workbook has no sheets to read',
      detail: 'The file opened, but it does not include a worksheet with data.',
      nextStep: 'Choose a workbook that contains the BI data sheet.',
    };
  }
  if (normalized.includes('worksheet') && normalized.includes('could not be read')) {
    return {
      title: 'The worksheet could not be opened',
      detail: 'The app found the first sheet, but could not read its rows.',
      nextStep: 'Save a fresh copy of the workbook, then import the new file.',
    };
  }
  if (normalized.includes('already running')) {
    return {
      title: 'An import is already in progress',
      detail: 'Let the current import finish, or cancel it before starting another one.',
      nextStep: 'Use Cancel if you meant to switch files.',
    };
  }
  if (normalized.includes('worker') || normalized.includes('import engine') || normalized.includes('importer')) {
    return {
      title: 'The local importer paused',
      detail: 'The file has not left your browser. The importer just needs a restart before it tries again.',
      nextStep: 'Restart and retry, or refresh the app if the retry does not begin.',
    };
  }
  return {
    title: 'The import could not finish',
    detail: message,
    nextStep: 'Check that the file is an Excel workbook or CSV, then choose it again.',
  };
}

function formatProgressPhase(progress: ImportProgress | null): string {
  if (!progress) return 'Getting ready';
  const normalized = progress.phase.toLowerCase();
  if (normalized.includes('starting') || normalized.includes('queued')) return 'Getting the import ready';
  if (normalized.includes('reading csv')) return 'Reading your CSV';
  if (normalized.includes('parsing csv')) return 'Checking CSV rows';
  if (normalized.includes('reading excel')) return 'Reading your workbook';
  if (normalized.includes('parsing excel')) return 'Opening the worksheet';
  if (normalized.includes('validating')) return 'Checking required columns';
  if (normalized.includes('normalizing')) return 'Preparing rows for review';
  if (normalized.includes('investor')) return 'Finding investors and funds';
  if (normalized.includes('scenario')) return 'Checking review scenarios';
  if (normalized.includes('finalizing')) return 'Finishing setup';
  return progress.phase;
}

function formatProgressDetail(progress: ImportProgress | null): string {
  if (!progress) return 'The local importer is starting.';
  if (progress.processedRows !== undefined && progress.totalRows) {
    return `${progress.processedRows.toLocaleString()} of ${progress.totalRows.toLocaleString()} rows prepared.`;
  }
  const normalized = progress.phase.toLowerCase();
  if (normalized.includes('starting')) return 'Checking that the local importer is ready.';
  if (normalized.includes('queued')) return 'Passing the selected file to the local importer.';
  if (normalized.includes('reading')) return 'Loading the file in this browser.';
  if (normalized.includes('parsing')) return 'Finding rows and columns.';
  if (normalized.includes('validating')) return 'Making sure the expected BI columns are present.';
  if (normalized.includes('scenario')) return 'Looking for known review patterns.';
  if (normalized.includes('finalizing')) return 'Preparing filters, investors, and the validation summary.';
  return progress.detail ?? 'Working locally on the selected file.';
}

function ImportProgressPanel({ progress, onCancel }: { progress: ImportProgress | null; onCancel: () => void }) {
  const percent =
    progress?.processedRows !== undefined && progress.totalRows
      ? Math.min(100, Math.round((progress.processedRows / progress.totalRows) * 100))
      : null;
  return (
    <div className="import-progress" title="Live progress for reading and preparing imported rows locally.">
      <div className="import-progress-copy">
        <strong>{formatProgressPhase(progress)}</strong>
        <span>{formatProgressDetail(progress)}</span>
      </div>
      <div className="import-progress-meter" aria-label="Import progress" title="Approximate percent of import processing completed.">
        <span style={{ width: `${percent ?? 18}%` }} />
      </div>
      <div className="import-progress-meta">
        <span>{percent !== null ? `${percent}% complete` : 'Working locally'}</span>
        <button className="text-button" type="button" onClick={onCancel} title="Stop the current import and leave the existing workbench state unchanged.">
          <XCircle size={15} /> Cancel
        </button>
      </div>
    </div>
  );
}
