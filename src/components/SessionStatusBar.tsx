import type { ImportProgress, ImportSummary } from '../types';

type SessionTone = 'ready' | 'importing' | 'attention' | 'neutral';

type SessionStatusBarProps = {
  isImporting: boolean;
  importProgress: ImportProgress | null;
  error: string | null;
  needsReimport: boolean;
  activeFileName: string | null;
  summary: ImportSummary | null;
};

type SessionState = {
  tone: SessionTone;
  label: string;
  detail: string;
};

type SessionFact = {
  label: string;
  title?: string;
  value: string;
};

export function SessionStatusBar({ summary, isImporting, importProgress, error, needsReimport, activeFileName }: SessionStatusBarProps) {
  const state = getSessionState(summary, isImporting, importProgress, error, needsReimport);
  const facts = getSessionFacts(summary, isImporting, importProgress, activeFileName);

  return (
    <section
      className={`session-summary-strip session-summary-strip-${state.tone}`}
      aria-label={`Session status: ${state.label}. ${state.detail}`}
      aria-live="polite"
      aria-busy={isImporting ? true : undefined}
    >
      <div className="session-summary-state">
        <span className="session-summary-dot" aria-hidden="true" />
        <span>
          <strong>{state.label}</strong>
          <small>{state.detail}</small>
        </span>
      </div>
      <dl className="session-summary-facts">
        {facts.map((fact) => (
          <div key={fact.label} title={fact.title}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function getSessionState(summary: ImportSummary | null, isImporting: boolean, importProgress: ImportProgress | null, error: string | null, needsReimport: boolean): SessionState {
  if (isImporting) {
    return {
      tone: 'importing',
      label: 'Importing',
      detail: importProgress?.phase ?? 'Reading the selected file.',
    };
  }

  if (error) {
    return {
      tone: 'attention',
      label: 'Needs attention',
      detail: summary ? 'Data is present, but review the message below.' : 'The import did not finish cleanly.',
    };
  }

  if (needsReimport) {
    return {
      tone: 'attention',
      label: 'Reconnect source file',
      detail: 'Re-import the source file to make rows available again.',
    };
  }

  if (summary) {
    return {
      tone: 'ready',
      label: 'Ready for review',
      detail: 'Data is loaded and the workspace is connected.',
    };
  }

  return {
    tone: 'neutral',
    label: 'No workbook loaded',
    detail: 'Import an Excel or CSV file to begin.',
  };
}

function getSessionFacts(summary: ImportSummary | null, isImporting: boolean, progress: ImportProgress | null, activeFileName: string | null): SessionFact[] {
  if (isImporting) {
    const rowProgress = progress?.processedRows === undefined
      ? 'Reading'
      : progress.totalRows
        ? `${formatNumber(progress.processedRows)} of ${formatNumber(progress.totalRows)}`
        : formatNumber(progress.processedRows);
    return [
      { label: 'File', value: activeFileName ?? summary?.fileName ?? 'Selected file' },
      { label: 'Rows', value: rowProgress },
      { label: 'Step', value: progress?.detail ?? progress?.phase ?? 'Importing' },
    ];
  }

  if (!summary) {
    return [
      { label: 'File', value: activeFileName ?? 'Waiting' },
      { label: 'Rows', value: 'Pending' },
      { label: 'Entries', value: 'Pending', title: 'Investor-product entries will appear after import.' },
    ];
  }

  return [
    { label: 'File', value: summary.fileName },
    { label: 'Rows', value: formatNumber(summary.totalRows) },
    {
      label: 'Entries',
      value: formatNumber(summary.investorCount),
      title: 'Investor-product entries. A single investor can appear once per product.',
    },
    { label: 'Funds', value: formatNumber(summary.programCount) },
  ];
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}
