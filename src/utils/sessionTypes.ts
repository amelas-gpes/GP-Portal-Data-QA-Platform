import type {
  AuditActorV2,
  AuditEventV2,
  ChartTab,
  DashboardFilters,
  EvidenceItemV2,
  EvidencePackageSummaryV2,
  EvidencePackageV2,
  FormulaDraftMetricStateV2,
  FormulaDraftMetricV2,
  FormulaDraftStateV2,
  FormulaMetric,
  FormulaRegistry,
  FormulaValidation,
  ImportFingerprintV2,
  ImportSourceKindV2,
  ImportSummary,
  ISODateTimeString,
  QASessionPhaseV2,
  QASessionStatusV2,
  QASessionV2,
  ScenarioRiskLevelV2,
  ScenarioRiskScoreV2,
  ScenarioSummary,
  Severity,
  SupportStatus,
  TooltipContextV2,
  ValidationSummary,
} from '../types';

export const QA_CONTRACT_VERSION = 'v2';

export interface CreateFormulaDraftStateInput {
  formulas: FormulaRegistry;
  validations?: Record<string, FormulaValidation>;
  actor?: AuditActorV2 | null;
  timestamp?: ISODateTimeString;
  revision?: number;
  status?: FormulaDraftStateV2['status'];
}

export interface CreateEvidencePackageInput {
  sessionId: string;
  title?: string;
  timestamp?: ISODateTimeString;
  importFingerprintId?: string | null;
  items?: EvidenceItemV2[];
  exportedAt?: ISODateTimeString | null;
  exportedBy?: AuditActorV2 | null;
}

export interface CreateImportFingerprintInput {
  fileName: string;
  sourceKind?: ImportSourceKindV2;
  workbookName?: string | null;
  sheetName?: string | null;
  fileSizeBytes?: number | null;
  lastModifiedAt?: ISODateTimeString | null;
  importedAt?: ISODateTimeString;
  contentHash?: string | null;
  schemaHash?: string | null;
  columns?: string[];
  normalizedColumns?: string[];
  validation?: ValidationSummary | null;
  summary?: ImportSummary | null;
}

export interface CreateQASessionInput {
  title: string;
  filters: DashboardFilters;
  formulas: FormulaRegistry;
  id?: string;
  status?: QASessionStatusV2;
  phase?: QASessionPhaseV2;
  owner?: AuditActorV2 | null;
  createdAt?: ISODateTimeString;
  updatedAt?: ISODateTimeString;
  activeTab?: ChartTab;
  logicVersion?: QASessionV2['logicVersion'];
  importFingerprint?: ImportFingerprintV2 | null;
  formulaDraft?: FormulaDraftStateV2;
  scenarioRiskScores?: ScenarioRiskScoreV2[];
  evidencePackage?: EvidencePackageV2;
  auditTrail?: AuditEventV2[];
  notes?: string[];
}

export type CreateTooltipContextInput = Omit<TooltipContextV2, 'contractVersion' | 'id'> & {
  id?: string;
};

export function nowIso(): ISODateTimeString {
  return new Date().toISOString();
}

export function createContractId(prefix: string, timestamp: ISODateTimeString = nowIso()): string {
  const timePart = timestamp.replace(/\D/g, '').slice(0, 14) || 'undated';
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${timePart}-${randomPart}`;
}

export function createFormulaDraftState(input: CreateFormulaDraftStateInput): FormulaDraftStateV2 {
  const timestamp = input.timestamp ?? nowIso();
  const validations = input.validations ?? {};
  const metrics = Object.values(input.formulas).reduce<Record<string, FormulaDraftMetricV2>>((draftMetrics, metric) => {
    const validation = validations[metric.id] ?? null;
    draftMetrics[metric.id] = createFormulaDraftMetric(metric, validation, input.actor ?? null, timestamp);
    return draftMetrics;
  }, {});
  const validationErrors = Object.values(validations).flatMap((validation) => validation.errors);
  const validationWarnings = Object.values(validations).flatMap((validation) => validation.warnings);
  const hasChanges = Object.values(metrics).some((metric) => metric.state !== 'unchanged');

  return {
    contractVersion: QA_CONTRACT_VERSION,
    revision: input.revision ?? 1,
    status: input.status ?? inferFormulaDraftStatus(hasChanges, validationErrors.length),
    baselineLogicVersion: 'production',
    previewLogicVersion: hasChanges ? 'draft' : 'production',
    lastEditedAt: hasChanges ? timestamp : null,
    lastEditedBy: hasChanges ? input.actor ?? null : null,
    metrics,
    validationErrors,
    validationWarnings,
  };
}

export function createEvidencePackage(input: CreateEvidencePackageInput): EvidencePackageV2 {
  const timestamp = input.timestamp ?? nowIso();
  const items = input.items ?? [];

  return {
    contractVersion: QA_CONTRACT_VERSION,
    id: createContractId('evidence-package', timestamp),
    sessionId: input.sessionId,
    title: input.title ?? 'QA evidence package',
    status: input.exportedAt ? 'exported' : items.length > 0 ? 'ready' : 'collecting',
    createdAt: timestamp,
    updatedAt: timestamp,
    importFingerprintId: input.importFingerprintId ?? null,
    items,
    summary: summarizeEvidenceItems(items),
    exportedAt: input.exportedAt ?? null,
    exportedBy: input.exportedBy ?? null,
  };
}

export function appendEvidenceItem(
  evidencePackage: EvidencePackageV2,
  item: EvidenceItemV2,
  timestamp: ISODateTimeString = nowIso(),
): EvidencePackageV2 {
  const items = [...evidencePackage.items, item];
  return {
    ...evidencePackage,
    status: evidencePackage.status === 'sealed' ? 'sealed' : 'ready',
    updatedAt: timestamp,
    items,
    summary: summarizeEvidenceItems(items),
  };
}

export function createImportFingerprint(input: CreateImportFingerprintInput): ImportFingerprintV2 {
  const importedAt = input.importedAt ?? nowIso();
  const validation = input.validation ?? input.summary?.validation ?? null;
  const columns = input.columns ?? validation?.headers ?? [];
  const normalizedColumns = input.normalizedColumns ?? validation?.normalizedHeaders ?? columns.map((column) => column.trim().toLowerCase());
  const missingColumns = validation?.missingColumns ?? [];
  const extraColumns = validation?.extraColumns ?? [];
  const duplicateColumns = validation?.duplicateColumns ?? [];
  const typeIssues = validation?.typeIssues ?? [];

  return {
    contractVersion: QA_CONTRACT_VERSION,
    id: createContractId('import', importedAt),
    sourceKind: input.sourceKind ?? inferImportSourceKind(input.fileName),
    fileName: input.fileName,
    workbookName: input.workbookName ?? null,
    sheetName: input.sheetName ?? validation?.sheetName ?? null,
    fileSizeBytes: input.fileSizeBytes ?? null,
    lastModifiedAt: input.lastModifiedAt ?? null,
    importedAt,
    contentHash: input.contentHash ?? null,
    schemaHash: input.schemaHash ?? null,
    rowCount: input.summary?.totalRows ?? validation?.rowCount ?? 0,
    investorCount: input.summary?.investorCount ?? 0,
    programCount: input.summary?.programCount ?? 0,
    columns,
    normalizedColumns,
    missingColumns,
    extraColumns,
    validationIssues: [
      ...missingColumns.map((column) => `Missing column: ${column}`),
      ...extraColumns.map((column) => `Extra column: ${column}`),
      ...duplicateColumns.map((column) => `Duplicate header: ${column}`),
      ...typeIssues,
    ],
  };
}

export function createQASession(input: CreateQASessionInput): QASessionV2 {
  const createdAt = input.createdAt ?? nowIso();
  const sessionId = input.id ?? createContractId('qa-session', createdAt);
  const formulaDraft = input.formulaDraft ?? createFormulaDraftState({ formulas: input.formulas, timestamp: createdAt, actor: input.owner ?? null });
  const evidencePackage = input.evidencePackage ?? createEvidencePackage({
    sessionId,
    timestamp: createdAt,
    importFingerprintId: input.importFingerprint?.id ?? null,
  });

  return {
    contractVersion: QA_CONTRACT_VERSION,
    id: sessionId,
    title: input.title,
    status: input.status ?? 'draft',
    phase: input.phase ?? 'import',
    owner: input.owner ?? null,
    createdAt,
    updatedAt: input.updatedAt ?? createdAt,
    importFingerprint: input.importFingerprint ?? null,
    filters: input.filters,
    activeTab: input.activeTab ?? 'workbench',
    logicVersion: input.logicVersion ?? 'production',
    formulaDraft,
    scenarioRiskScores: input.scenarioRiskScores ?? [],
    evidencePackage,
    auditTrail: input.auditTrail ?? [],
    notes: input.notes ?? [],
  };
}

export function touchQASession(
  session: QASessionV2,
  updates: Partial<Omit<QASessionV2, 'contractVersion' | 'id' | 'createdAt'>>,
  timestamp: ISODateTimeString = nowIso(),
): QASessionV2 {
  return {
    ...session,
    ...updates,
    updatedAt: timestamp,
  };
}

export function scoreScenarioRisk(
  summary: ScenarioSummary,
  options: {
    chartIds?: string[];
    evidenceItemIds?: string[];
    lastCalculatedAt?: ISODateTimeString;
    notes?: string;
  } = {},
): ScenarioRiskScoreV2 {
  const severityImpact = SEVERITY_BASE_SCORE[summary.severity];
  const supportImpact = SUPPORT_STATUS_SCORE[summary.status];
  const exposureImpact = Math.min(25, summary.affectedInvestorCount * 2 + summary.affectedRowCount * 0.1);
  const score = clampRiskScore(severityImpact + supportImpact + exposureImpact);

  return {
    contractVersion: QA_CONTRACT_VERSION,
    scenarioId: summary.id,
    scenarioName: summary.name,
    severity: summary.severity,
    supportStatus: summary.status,
    riskLevel: riskLevelForScore(score),
    score,
    affectedInvestorCount: summary.affectedInvestorCount,
    affectedRowCount: summary.affectedRowCount,
    chartIds: options.chartIds ?? [],
    drivers: [
      {
        id: 'severity',
        label: `${summary.severity} severity`,
        weight: 1,
        scoreImpact: severityImpact,
        evidenceItemIds: [],
      },
      {
        id: 'support-status',
        label: summary.status,
        weight: 1,
        scoreImpact: supportImpact,
        evidenceItemIds: [],
      },
      {
        id: 'exposure',
        label: `${summary.affectedInvestorCount} investor(s), ${summary.affectedRowCount} row(s)`,
        weight: 1,
        scoreImpact: exposureImpact,
        evidenceItemIds: options.evidenceItemIds ?? [],
      },
    ].filter((driver) => driver.scoreImpact !== 0),
    evidenceItemIds: options.evidenceItemIds ?? [],
    lastCalculatedAt: options.lastCalculatedAt ?? nowIso(),
    notes: options.notes,
  };
}

export function riskLevelForScore(score: number): ScenarioRiskLevelV2 {
  if (score <= 0) return 'none';
  if (score < 30) return 'low';
  if (score < 55) return 'medium';
  if (score < 80) return 'high';
  return 'critical';
}

export function createTooltipContext(input: CreateTooltipContextInput): TooltipContextV2 {
  const { id, ...context } = input;
  return {
    contractVersion: QA_CONTRACT_VERSION,
    id: id ?? createContractId('tooltip'),
    ...context,
  };
}

function createFormulaDraftMetric(
  metric: FormulaMetric,
  validation: FormulaValidation | null,
  actor: AuditActorV2 | null,
  timestamp: ISODateTimeString,
): FormulaDraftMetricV2 {
  const state = formulaDraftMetricState(metric, validation);
  return {
    metricId: metric.id,
    visualId: metric.visualId,
    visualName: metric.visualName,
    metricName: metric.metricName,
    chartElement: metric.chartElement,
    productionFormula: metric.productionFormula,
    draftFormula: metric.draftFormula,
    sourceFields: metric.sourceFields,
    absUsed: metric.absUsed,
    state,
    validation,
    updatedAt: state === 'unchanged' ? null : timestamp,
    updatedBy: state === 'unchanged' ? null : actor,
    reason: null,
  };
}

function formulaDraftMetricState(metric: FormulaMetric, validation: FormulaValidation | null): FormulaDraftMetricStateV2 {
  if (validation && !validation.ok) return 'invalid';
  if (metric.productionFormula === metric.draftFormula) return 'unchanged';
  return validation ? 'validated' : 'edited';
}

function inferFormulaDraftStatus(hasChanges: boolean, errorCount: number): FormulaDraftStateV2['status'] {
  if (errorCount > 0) return 'invalid';
  return hasChanges ? 'dirty' : 'clean';
}

function summarizeEvidenceItems(items: EvidenceItemV2[]): EvidencePackageSummaryV2 {
  const scenarioIds = new Set<string>();
  const formulaMetricIds = new Set<string>();
  let screenshotCount = 0;
  let reconciliationRowCount = 0;

  for (const item of items) {
    if (item.kind === 'screenshot') screenshotCount += 1;
    if (item.kind === 'reconciliation') reconciliationRowCount += item.relatedRowIds.length;
    item.relatedScenarioIds.forEach((id) => scenarioIds.add(id));
    item.relatedMetricIds.forEach((id) => formulaMetricIds.add(id));
  }

  return {
    itemCount: items.length,
    screenshotCount,
    scenarioCount: scenarioIds.size,
    formulaChangeCount: formulaMetricIds.size,
    reconciliationRowCount,
  };
}

function inferImportSourceKind(fileName: string): ImportSourceKindV2 {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.csv')) return 'csv';
  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xlsm') || lowerName.endsWith('.xls')) return 'workbook';
  return 'unknown';
}

function clampRiskScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

const SEVERITY_BASE_SCORE: Record<Severity, number> = {
  High: 60,
  Medium: 35,
  Low: 15,
};

const SUPPORT_STATUS_SCORE: Record<SupportStatus, number> = {
  Broken: 30,
  'Not supported': 25,
  Partial: 15,
  Supported: -15,
  'Decision needed': 20,
  Placeholder: 5,
};
