import type { ISODateTimeString, JsonValue } from '../types';

export const AUDIT_LOG_SCHEMA_VERSION = 'gp-portal-audit-log.v1';

export const auditLogActions = {
  importCompleted: 'import.completed',
  filtersChanged: 'filters.changed',
  investorSelectionChanged: 'investor.selection.changed',
  draftEdited: 'formula.draft.edited',
  draftApplied: 'formula.draft.applied',
  draftReset: 'formula.draft.reset',
  scenarioJumped: 'scenario.jumped',
  exportCreated: 'export.created',
  investorVerdictRecorded: 'investor.verdict.recorded',
} as const;

export type AuditLogAction = (typeof auditLogActions)[keyof typeof auditLogActions];
export type AuditLogMetadata = Record<string, JsonValue>;
export type AuditLogSnapshot = Record<string, JsonValue>;

export interface AuditLogActor {
  id: string;
  displayName: string;
  role: 'admin' | 'qa' | 'reviewer' | 'system' | (string & {});
  email?: string;
}

export interface AuditLogTarget {
  type: 'import' | 'filters' | 'investor-selection' | 'formula-draft' | 'scenario' | 'export' | (string & {});
  id: string;
  label?: string;
}

export interface ImportAuditDetails {
  fileName: string;
  sourceKind: 'workbook' | 'csv' | 'manual' | 'sample' | 'unknown' | (string & {});
  rowCount: number;
  investorCount: number;
  programCount: number;
  validationIssueCount: number;
  contentHash: string | null;
  schemaHash: string | null;
}

export interface FilterChangeAuditDetails {
  changedKeys: string[];
  before: AuditLogSnapshot;
  after: AuditLogSnapshot;
}

export interface InvestorSelectionAuditDetails {
  beforeInvestorKeys: string[];
  afterInvestorKeys: string[];
  addedInvestorKeys: string[];
  removedInvestorKeys: string[];
}

export interface DraftEditAuditDetails {
  metricId: string;
  visualId: string | null;
  metricName: string | null;
  beforeFormula: string;
  afterFormula: string;
  validationStatus: 'not-validated' | 'valid' | 'invalid';
}

export interface DraftApplyAuditDetails {
  metricIds: string[];
  logicVersion: 'draft';
  reason: string | null;
}

export interface DraftResetAuditDetails {
  metricIds: string[];
  resetScope: 'metric' | 'all';
  resetTo: 'production';
  reason: string | null;
}

export interface ScenarioJumpAuditDetails {
  scenarioId: string;
  scenarioName: string | null;
  fromInvestorKeys: string[];
  toInvestorKeys: string[];
  targetTab: string | null;
}

export interface ExportAuditDetails {
  exportName: string;
  format: 'json' | 'csv' | 'xlsx' | (string & {});
  includedSections: string[];
  eventCountBeforeExport: number;
}

export interface InvestorVerdictAuditDetails {
  investorKey: string;
  status: 'approved' | 'watch' | 'flagged';
  tier: string;
  note: string | null;
}

export type AuditLogEventDetails =
  | ImportAuditDetails
  | FilterChangeAuditDetails
  | InvestorSelectionAuditDetails
  | DraftEditAuditDetails
  | DraftApplyAuditDetails
  | DraftResetAuditDetails
  | ScenarioJumpAuditDetails
  | ExportAuditDetails
  | InvestorVerdictAuditDetails;

export interface AuditLogEvent {
  id: string;
  schemaVersion: typeof AUDIT_LOG_SCHEMA_VERSION;
  sequence: number;
  occurredAt: ISODateTimeString;
  action: AuditLogAction;
  actor: AuditLogActor;
  target: AuditLogTarget;
  summary: string;
  details: AuditLogEventDetails;
  metadata?: AuditLogMetadata;
}

export interface AuditLog {
  schemaVersion: typeof AUDIT_LOG_SCHEMA_VERSION;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
  events: AuditLogEvent[];
}

export interface AuditLogExport {
  schemaVersion: typeof AUDIT_LOG_SCHEMA_VERSION;
  exportedAt: ISODateTimeString;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
  eventCount: number;
  events: AuditLogEvent[];
}

export interface CreateAuditLogInput {
  createdAt?: ISODateTimeString;
  updatedAt?: ISODateTimeString;
  events?: AuditLogEvent[];
}

export interface AppendAuditEventInput {
  id?: string;
  occurredAt?: ISODateTimeString;
  actor?: Partial<AuditLogActor>;
  action: AuditLogAction;
  target: AuditLogTarget;
  summary: string;
  details: AuditLogEventDetails;
  metadata?: AuditLogMetadata;
}

export type AuditCommandInput = {
  id?: string;
  occurredAt?: ISODateTimeString;
  actor?: Partial<AuditLogActor>;
  metadata?: AuditLogMetadata;
};

export type RecordImportInput = AuditCommandInput & {
  fileName: string;
  sourceKind?: ImportAuditDetails['sourceKind'];
  rowCount: number;
  investorCount: number;
  programCount: number;
  validationIssueCount?: number;
  contentHash?: string | null;
  schemaHash?: string | null;
};

export type RecordFilterChangeInput = AuditCommandInput & {
  before: AuditLogSnapshot;
  after: AuditLogSnapshot;
};

export type RecordInvestorSelectionInput = AuditCommandInput & {
  beforeInvestorKeys: string[];
  afterInvestorKeys: string[];
};

export type RecordDraftEditInput = AuditCommandInput & {
  metricId: string;
  visualId?: string | null;
  metricName?: string | null;
  beforeFormula: string;
  afterFormula: string;
  validationStatus?: DraftEditAuditDetails['validationStatus'];
};

export type RecordDraftApplyInput = AuditCommandInput & {
  metricIds: string[];
  reason?: string | null;
};

export type RecordDraftResetInput = AuditCommandInput & {
  metricIds: string[];
  resetScope: DraftResetAuditDetails['resetScope'];
  reason?: string | null;
};

export type RecordScenarioJumpInput = AuditCommandInput & {
  scenarioId: string;
  scenarioName?: string | null;
  fromInvestorKeys: string[];
  toInvestorKeys: string[];
  targetTab?: string | null;
};

export type RecordExportInput = AuditCommandInput & {
  exportName: string;
  format?: ExportAuditDetails['format'];
  includedSections: string[];
};

export function createAuditLog(input: CreateAuditLogInput = {}): AuditLog {
  const timestamp = input.createdAt ?? nowIso();
  const events = cloneJson(input.events ?? []);

  return {
    schemaVersion: AUDIT_LOG_SCHEMA_VERSION,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? events.at(-1)?.occurredAt ?? timestamp,
    events,
  };
}

export function appendAuditEvent(log: AuditLog, input: AppendAuditEventInput): AuditLog {
  const sequence = nextSequence(log);
  const occurredAt = input.occurredAt ?? nowIso();
  const event: AuditLogEvent = {
    id: input.id ?? createAuditEventId(sequence, occurredAt),
    schemaVersion: AUDIT_LOG_SCHEMA_VERSION,
    sequence,
    occurredAt,
    action: input.action,
    actor: normalizeActor(input.actor),
    target: cloneJson(input.target),
    summary: input.summary,
    details: cloneJson(input.details),
    metadata: input.metadata ? cloneJson(input.metadata) : undefined,
  };

  return {
    ...log,
    updatedAt: occurredAt,
    events: [...log.events, event],
  };
}

export function recordImport(log: AuditLog, input: RecordImportInput): AuditLog {
  return appendAuditEvent(log, {
    ...commandFields(input),
    action: auditLogActions.importCompleted,
    target: { type: 'import', id: input.contentHash ?? input.fileName, label: input.fileName },
    summary: `Imported ${input.fileName}`,
    details: {
      fileName: input.fileName,
      sourceKind: input.sourceKind ?? inferSourceKind(input.fileName),
      rowCount: input.rowCount,
      investorCount: input.investorCount,
      programCount: input.programCount,
      validationIssueCount: input.validationIssueCount ?? 0,
      contentHash: input.contentHash ?? null,
      schemaHash: input.schemaHash ?? null,
    },
  });
}

export function recordFilterChange(log: AuditLog, input: RecordFilterChangeInput): AuditLog {
  const changedKeys = diffSnapshotKeys(input.before, input.after);

  return appendAuditEvent(log, {
    ...commandFields(input),
    action: auditLogActions.filtersChanged,
    target: { type: 'filters', id: 'dashboard-filters', label: 'Dashboard filters' },
    summary: changedKeys.length === 1 ? `Changed ${changedKeys[0]} filter` : `Changed ${changedKeys.length} filters`,
    details: {
      changedKeys,
      before: cloneJson(input.before),
      after: cloneJson(input.after),
    },
  });
}

export function recordInvestorSelection(log: AuditLog, input: RecordInvestorSelectionInput): AuditLog {
  const addedInvestorKeys = difference(input.afterInvestorKeys, input.beforeInvestorKeys);
  const removedInvestorKeys = difference(input.beforeInvestorKeys, input.afterInvestorKeys);

  return appendAuditEvent(log, {
    ...commandFields(input),
    action: auditLogActions.investorSelectionChanged,
    target: { type: 'investor-selection', id: 'selected-investors', label: 'Selected investors' },
    summary: `Selected ${input.afterInvestorKeys.length} investor${input.afterInvestorKeys.length === 1 ? '' : 's'}`,
    details: {
      beforeInvestorKeys: [...input.beforeInvestorKeys],
      afterInvestorKeys: [...input.afterInvestorKeys],
      addedInvestorKeys,
      removedInvestorKeys,
    },
  });
}

export function recordDraftEdit(log: AuditLog, input: RecordDraftEditInput): AuditLog {
  return appendAuditEvent(log, {
    ...commandFields(input),
    action: auditLogActions.draftEdited,
    target: { type: 'formula-draft', id: input.metricId, label: input.metricName ?? input.metricId },
    summary: `Edited draft formula for ${input.metricName ?? input.metricId}`,
    details: {
      metricId: input.metricId,
      visualId: input.visualId ?? null,
      metricName: input.metricName ?? null,
      beforeFormula: input.beforeFormula,
      afterFormula: input.afterFormula,
      validationStatus: input.validationStatus ?? 'not-validated',
    },
  });
}

export function recordDraftApply(log: AuditLog, input: RecordDraftApplyInput): AuditLog {
  return appendAuditEvent(log, {
    ...commandFields(input),
    action: auditLogActions.draftApplied,
    target: { type: 'formula-draft', id: 'applied-draft', label: 'Applied draft formulas' },
    summary: `Applied ${input.metricIds.length} draft formula${input.metricIds.length === 1 ? '' : 's'}`,
    details: {
      metricIds: [...input.metricIds],
      logicVersion: 'draft',
      reason: input.reason ?? null,
    },
  });
}

export function recordDraftReset(log: AuditLog, input: RecordDraftResetInput): AuditLog {
  return appendAuditEvent(log, {
    ...commandFields(input),
    action: auditLogActions.draftReset,
    target: { type: 'formula-draft', id: input.resetScope === 'all' ? 'all-drafts' : input.metricIds[0] ?? 'selected-draft', label: input.resetScope === 'all' ? 'All draft formulas' : 'Draft formula' },
    summary: input.resetScope === 'all' ? 'Reset all draft formulas to production' : `Reset ${input.metricIds[0] ?? 'draft formula'} to production`,
    details: {
      metricIds: [...input.metricIds],
      resetScope: input.resetScope,
      resetTo: 'production',
      reason: input.reason ?? null,
    },
  });
}

export function recordScenarioJump(log: AuditLog, input: RecordScenarioJumpInput): AuditLog {
  return appendAuditEvent(log, {
    ...commandFields(input),
    action: auditLogActions.scenarioJumped,
    target: { type: 'scenario', id: input.scenarioId, label: input.scenarioName ?? input.scenarioId },
    summary: `Jumped to scenario ${input.scenarioName ?? input.scenarioId}`,
    details: {
      scenarioId: input.scenarioId,
      scenarioName: input.scenarioName ?? null,
      fromInvestorKeys: [...input.fromInvestorKeys],
      toInvestorKeys: [...input.toInvestorKeys],
      targetTab: input.targetTab ?? null,
    },
  });
}

export function recordExport(log: AuditLog, input: RecordExportInput): AuditLog {
  return appendAuditEvent(log, {
    ...commandFields(input),
    action: auditLogActions.exportCreated,
    target: { type: 'export', id: input.exportName, label: input.exportName },
    summary: `Exported ${input.exportName}`,
    details: {
      exportName: input.exportName,
      format: input.format ?? 'json',
      includedSections: [...input.includedSections],
      eventCountBeforeExport: log.events.length,
    },
  });
}

export type RecordInvestorVerdictInput = AuditCommandInput & {
  investorKey: string;
  status: 'approved' | 'watch' | 'flagged';
  tier: string;
  note: string | null;
};

export function recordInvestorVerdict(log: AuditLog, input: RecordInvestorVerdictInput): AuditLog {
  return appendAuditEvent(log, {
    ...commandFields(input),
    action: auditLogActions.investorVerdictRecorded,
    target: { type: 'investor-selection', id: input.investorKey, label: input.investorKey },
    summary: `Recorded ${input.status} verdict for ${input.investorKey}`,
    details: {
      investorKey: input.investorKey,
      status: input.status,
      tier: input.tier,
      note: input.note,
    },
  });
}

export function exportAuditLog(log: AuditLog, exportedAt: ISODateTimeString = nowIso()): AuditLogExport {
  return {
    schemaVersion: log.schemaVersion,
    exportedAt,
    createdAt: log.createdAt,
    updatedAt: log.updatedAt,
    eventCount: log.events.length,
    events: cloneJson(log.events),
  };
}

export function serializeAuditLogExport(log: AuditLog, exportedAt: ISODateTimeString = nowIso()): string {
  return JSON.stringify(exportAuditLog(log, exportedAt), null, 2);
}

export function diffSnapshotKeys(before: AuditLogSnapshot, after: AuditLogSnapshot): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return Array.from(keys)
    .filter((key) => stableStringify(before[key]) !== stableStringify(after[key]))
    .sort();
}

function commandFields(input: AuditCommandInput): Pick<AppendAuditEventInput, 'id' | 'occurredAt' | 'actor' | 'metadata'> {
  return {
    id: input.id,
    occurredAt: input.occurredAt,
    actor: input.actor,
    metadata: input.metadata,
  };
}

function normalizeActor(actor?: Partial<AuditLogActor>): AuditLogActor {
  return {
    id: actor?.id ?? 'system',
    displayName: actor?.displayName ?? 'System',
    role: actor?.role ?? 'system',
    email: actor?.email,
  };
}

function nowIso(): ISODateTimeString {
  return new Date().toISOString();
}

function nextSequence(log: AuditLog): number {
  return (log.events.at(-1)?.sequence ?? 0) + 1;
}

function createAuditEventId(sequence: number, occurredAt: ISODateTimeString): string {
  const timestamp = occurredAt.replace(/\D/g, '').slice(0, 14) || 'undated';
  return `audit-${timestamp}-${sequence.toString().padStart(4, '0')}`;
}

function inferSourceKind(fileName: string): ImportAuditDetails['sourceKind'] {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.csv')) return 'csv';
  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xlsm') || lowerName.endsWith('.xls')) return 'workbook';
  return 'unknown';
}

function difference(nextValues: string[], previousValues: string[]): string[] {
  const previous = new Set(previousValues);
  return nextValues.filter((value) => !previous.has(value));
}

function stableStringify(value: JsonValue | undefined): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
