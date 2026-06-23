export type LogicVersion = 'production' | 'draft';

export type InvestorVisualMode = 'combined' | 'individual';

export type ChartTab =
  | 'review'
  | 'logic'
  | 'workbench'
  | 'lp'
  | 'gp'
  | 'scenarios'
  | 'reconciliation'
  | 'raw'
  | 'settings';

export type GroupingMode = 'investorFundPairing' | 'groupCode' | 'investorCode';

export type Severity = 'High' | 'Medium' | 'Low';

export type SupportStatus =
  | 'Broken'
  | 'Not supported'
  | 'Partial'
  | 'Supported'
  | 'Decision needed'
  | 'Placeholder';

export type BIRow = {
  rowId: number;
  investorKey: string;
  programKey: string;
  companyGroupCode: string | null;
  companyName: string | null;
  companySubcategoryType: string | null;
  investorType: string | null;
  investorPortalDisplayName: string | null;
  investorGroupName: string | null;
  investorNo: string | null;
  investorShortCode: string | null;
  postingDate: Date | null;
  postingYear: number | null;
  postingQuarter: number | null;
  postingQuarterLabel: string | null;
  investorTotalCommitments: number;
  contributionsAffectRemainingCommitment: number;
  recallableDistributions: number;
  waiver: number;
  unfundedCapitalAdjustment: number;
  investorAvailableUnfundedCommitments: number;
  actualContributions: number;
  actualDistributions: number;
  placementFees: number;
  netInvestmentIncome: number;
  realizedGain: number;
  unrealizedGain: number;
  transferOfInterest: number;
  capitalAccountBalance: number;
  carryBalance: number;
  carryTransfer: number;
  endingNavGrossCarry: number;
  carryRealized: number;
  carryUnrealized: number;
  carryPaid: number;
  itdContributions: number;
  itdGrossContributions: number;
  investmentsValue: number;
  capCallDistCode: string | null;
  totalContributions: number;
  totalDistributions: number;
  investmentStrategy: string | null;
  accountingBasis: string | null;
  fundCurrencyCode: string | null;
  auditor: string | null;
  managementFeePctDuringIP: number;
  managementFeePctThereafter: number;
  managementFeePctThereafterDescription: string | null;
  modelType: string | null;
  carriedInterestPct: number;
  carriedInterestPctDescription: string | null;
  hurdleRatePreferredReturn: number;
  hurdleRatePreferredReturnDescription: string | null;
  investorSideLetterDate: Date | null;
  dateMostRecentPartnershipAgreement: Date | null;
  dateOperationsCommenced: Date | null;
  investmentCost: number;
  investmentRealizedDistribution: number;
  specialProfits: number;
  partnerTransfer: number;
  partnerTransferInvestmentActivity: number;
  partnerTransferContribution: number;
  actualInvestmentActivity: number;
  flags: RowFlags;
  raw: Record<string, unknown>;
};

export type RowFlags = {
  hasNegativeNAV: boolean;
  hasNegativeUnfunded: boolean;
  hasBlankCapCallDistWithValue: boolean;
  hasNonStandardCapCallDist: boolean;
  hasMixedSigns: boolean;
  hasPositiveContribution: boolean;
  hasNegativeDistribution: boolean;
  hasNegativeCarryPaid: boolean;
};

export type InvestorOption = {
  key: string;
  label: string;
  investorPortalDisplayName: string | null;
  investorGroupName: string | null;
  investorNo: string | null;
  investorShortCode: string | null;
  companyName: string | null;
  companyGroupCode: string | null;
  fundCurrencyCode: string | null;
  investorType: string | null;
  rowCount: number;
};

export type ValidationSeverity = 'ok' | 'warning' | 'error';

export type ColumnValidationIssue = {
  column: string;
  severity: Exclude<ValidationSeverity, 'ok'>;
  message: string;
};

export type TypeIssueGroup = {
  fieldKey: string;
  header: string;
  kind: 'date' | 'number';
  severity: Exclude<ValidationSeverity, 'ok'>;
  rowCount: number;
  sampleRows: number[];
  examples: string[];
  message: string;
};

export type RowCountReconciliation = {
  sourceRows: number;
  importedRows: number;
  blankRowsSkipped: number;
  rejectedRows: number;
  status: 'matched' | 'skipped_blank_rows' | 'mismatch';
  message: string;
};

export type ImportTimingSummary = {
  sourceKind: 'csv' | 'excel';
  readMs: number;
  parseMs: number;
  normalizeMs: number;
  scenarioMs: number;
  totalMs: number;
};

export type ValidationSummary = {
  schemaVersion: string;
  sheetName: string;
  headers: string[];
  normalizedHeaders: string[];
  severity: ValidationSeverity;
  missingColumns: string[];
  extraColumns: string[];
  duplicateColumns: string[];
  missingColumnIssues: ColumnValidationIssue[];
  extraColumnIssues: ColumnValidationIssue[];
  duplicateColumnIssues: ColumnValidationIssue[];
  /** Known-but-optional columns absent from this import; display falls back. */
  optionalColumnIssues?: ColumnValidationIssue[];
  typeIssues: string[];
  typeIssueGroups: TypeIssueGroup[];
  rowCount: number;
  rowCountReconciliation: RowCountReconciliation;
  timing: ImportTimingSummary;
};

export type FilterOptions = {
  investorTypes: string[];
  investorGroups: string[];
  companyGroupCodes: string[];
  companyNames: string[];
  fundCurrencyCodes: string[];
  maxDate: string | null;
};

export type ImportSummary = {
  fileName: string;
  validation: ValidationSummary;
  totalRows: number;
  investorCount: number;
  programCount: number;
  defaultInvestorKey: string | null;
  investorOptions: InvestorOption[];
  filterOptions: FilterOptions;
  scenarioModel: ScenarioModel;
  /** `{ "${visualId}::${label}": investorKey[] }` — powers the scenario filter. */
  scenarioInvestorsById: Record<string, string[]>;
};

export type ImportProgress = {
  phase: string;
  detail?: string;
  processedRows?: number;
  totalRows?: number;
  startedAt: number;
};

export type DashboardFilters = {
  investorType: string;
  investorGroupName: string;
  companyGroupCode: string;
  companyName: string;
  fundCurrencyCode: string;
  endDate: string;
  cumulative: boolean;
  groupingMode: GroupingMode;
  scenarioId: string;
};

export type FormulaMetric = {
  id: string;
  visualId: string;
  visualName: string;
  metricName: string;
  chartElement: string;
  productionFormula: string;
  draftFormula: string;
  revisedFormula?: string;
  sourceFields: string[];
  absUsed: boolean;
  behavior: string;
  edgeCase: string;
};

export type FormulaRegistry = Record<string, FormulaMetric>;

export type TooltipMetricContext = {
  productionValue: number;
  draftValue: number;
  delta: number;
  rowCount: number;
};

export type TooltipMetricContextMap = Record<string, TooltipMetricContext>;

export type FieldActivationStatus = 'current' | 'needsActivation' | 'unknown';

export type FormulaFieldReference = {
  field: string;
  header: string;
  status: FieldActivationStatus;
  statusLabel: string;
  detail: string;
  canCalculate: boolean;
};

export type FormulaValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  referencedFields: string[];
  fieldReferences: FormulaFieldReference[];
  referencedMetrics: string[];
};

export type QuarterPoint = {
  key: string;
  label: string;
  endDate: string | null;
  rowCount: number;
  contributions: number;
  distributions: number;
  commitments: number;
  unfundedCommitments: number;
  capitalAccountBalance: number;
  totalValue: number;
  tvpi: number;
  dpi: number;
  capitalAtWork: number;
  percentDeployed: number;
  nonRecallableDistributions: number;
  tooltipMetrics: TooltipMetricContextMap;
};

export type ProgramPoint = {
  programKey: string;
  programName: string;
  companyGroupCode: string | null;
  rowCount: number;
  ltdUnfunded: number;
  ltdDeemed: number;
  ltdCash: number;
  ltdCommitment: number;
  investmentValue: number;
  carriedInterestDistributed: number;
  carriedInterestBalance: number;
  investmentDistributed: number;
  transferOfInterest: number;
  totalValue: number;
  carryRealizedDistributed: number;
  carryRealizedUndistributed: number;
  carryUnrealizedGain: number;
  carryTransfer: number;
  totalCarriedInterest: number;
  tooltipMetrics: TooltipMetricContextMap;
};

export type YearPoint = {
  year: number;
  label: string;
  rowCount: number;
  contributions: number;
  distributions: number;
  netCash: number;
  tooltipMetrics: TooltipMetricContextMap;
};

export type KpiSummary = {
  totalCommitment: number;
  totalValue: number;
  totalCarriedInterest: number;
};

export type PieModel = {
  suppressed: boolean;
  reason: string | null;
  inner: Array<{ name: string; value: number; signedValue: number; tooltipMetricKey: string; rowCount: number; tooltipMetrics: TooltipMetricContextMap }>;
  outer: Array<{ name: string; value: number; signedValue: number; category: string; tooltipMetricKey: string; rowCount: number; tooltipMetrics: TooltipMetricContextMap }>;
};

export type ChartBundle = {
  investorKey: string | null;
  selectedInvestor: InvestorOption | null;
  investorKeys: string[];
  selectedInvestors: InvestorOption[];
  rowCount: number;
  quarterSeries: QuarterPoint[];
  programSeries: ProgramPoint[];
  yearSeries: YearPoint[];
  kpis: KpiSummary;
  pies: {
    ltdCommitment: PieModel;
    totalValue: PieModel;
    carriedInterest: PieModel;
  };
  rawRows: BIRow[];
};

export type ChartBundleSet = {
  combined: ChartBundle;
  individual: ChartBundle[];
};

export type ScenarioDefinition = {
  id: string;
  name: string;
  label: string;
  description: string;
  severity: Severity;
  status: SupportStatus;
  guardrail: string;
};

export type ScenarioHit = {
  scenarioId: string;
  investorKey: string;
  rowIds: number[];
  rowCount?: number;
  chartIds: string[];
  message: string;
  scope?: ScenarioHitScope;
};

export type ScenarioHitScope = {
  kind: 'lp-period' | 'lp-cumulative' | 'lp-mixed' | 'gp-program' | 'gp-year' | 'gp-all-programs';
  key: string;
  programKey?: string;
  quarterLabel?: string | null;
  year?: number | null;
  endDate?: string | null;
};

export type ScenarioSummary = ScenarioDefinition & {
  affectedInvestorCount: number;
  affectedRowCount: number;
  productionDraftDiffer: boolean;
};

// ── Sign-pattern scenario model (workbook-driven) ──────────────────────────
// A "scenario" is the sign tuple of an investor's aggregated metrics, one
// classification per visual (per RRE Scenarios.xlsx). Replaces the QA edge-case
// catalog + severity tiers. Signs use raw ledger values: a paid-in contribution
// is negative, returned cash (distribution) is positive.

export type SignToken = '+' | '-' | '0';

export type ScenarioVisualId = 'cashFlow' | 'commitment' | 'ratio' | 'totalValue' | 'capitalAtWork';

export type InvestorScenarioMetrics = {
  contributions: number;
  distributions: number;
  commitments: number;
  unfunded: number;
  capitalAccountBalance: number;
  recallable: number;
  nonRecallable: number;
  totalValue: number;
  calledCapital: number;
  capitalAtWork: number;
  percentDeployed: number;
};

/** Base ledger metrics whose raw +/− row entries can net to zero. */
export type ScenarioMetricKey = 'contributions' | 'distributions' | 'commitments' | 'unfunded' | 'capitalAccountBalance';

/**
 * Gross positive vs negative row totals for one base metric. When the net
 * (pos + neg) is ~0 but a side is non-zero, the metric reads 0 only because
 * offsetting entries cancel — not because there was no activity. This is a
 * purely arithmetic distinction; it ascribes no cause to the offset.
 */
export type GrossComponents = { pos: number; neg: number };

export type ScenarioGross = Record<ScenarioMetricKey, GrossComponents>;

export type InvestorScenarioRecord = {
  investorKey: string;
  shortCode: string | null;
  portalName: string | null;
  fund: string | null;
  rowCount: number;
  metrics: InvestorScenarioMetrics;
  labels: Record<ScenarioVisualId, string>;
  signs: Record<ScenarioVisualId, SignToken[]>;
  /**
   * Gross +/− breakdown per base metric (populated by the classifier). Lets the
   * UI tell a true zero apart from a 0 produced by offsetting entries. Optional
   * so records constructed in tests need not supply it.
   */
  gross?: ScenarioGross;
};

export type ScenarioBucket = {
  visualId: ScenarioVisualId;
  /** Stable id, `${visualId}::${label}`, used as the scenario filter key. */
  id: string;
  label: string;
  signs: SignToken[];
  investorKeys: string[];
  count: number;
};

/**
 * One contiguous stretch of posting quarters during which an investor-fund's
 * cumulative-through-quarter metrics produced a single scenario label. The
 * sequence of spans is the investor's scenario *timeline* for a visual; the
 * last span (isCurrent) is the latest state and equals the snapshot label.
 */
export type ScenarioSpan = {
  label: string;
  signs: SignToken[];
  startQuarterLabel: string;
  endQuarterLabel: string;
  /** Sortable quarter keys (year*4 + quarter-1; undated rows sort first as -1). */
  startKey: number;
  endKey: number;
  quarterCount: number;
  /** True for the most recent span — the state "as of latest". */
  isCurrent: boolean;
};

export type InvestorScenarioTimeline = Record<ScenarioVisualId, ScenarioSpan[]>;

export type ScenarioModel = {
  /** Scenarios present per visual, sorted by investor count descending. */
  byVisual: Record<ScenarioVisualId, ScenarioBucket[]>;
  recordByInvestor: Record<string, InvestorScenarioRecord>;
  /** Per investor-fund, the cumulative scenario timeline for each visual. */
  timelineByInvestor: Record<string, InvestorScenarioTimeline>;
};

export type ReconciliationRow = {
  investorKey: string;
  investor: string;
  company: string;
  metric: string;
  productionValue: number;
  draftValue: number;
  absoluteDelta: number;
  percentDelta: number | null;
  scenarioFlags: string[];
};

export type ReconciliationSummary = {
  affectedInvestorCount: number;
  topAbsolute: ReconciliationRow[];
  topPercent: ReconciliationRow[];
  metricsChanged: string[];
  chartsChanged: string[];
  invalidFormulas: string[];
};

export type WorkerImportPayload = {
  file: File;
  formulas: FormulaRegistry;
};

export type WorkerComputePayload = {
  investorKeys: string[];
  filters: DashboardFilters;
  formulas: FormulaRegistry;
  logicVersion: LogicVersion;
};

export type WorkerComputeBundleSetPayload = WorkerComputePayload & {
  includeIndividualBundles?: boolean;
  /** False returns bundles without rawRows (cheap clone); evidence/simulation refetch with rows. */
  includeRawRows?: boolean;
};

export type WorkerComparePayload = {
  filters: DashboardFilters;
  formulas: FormulaRegistry;
};

export type ISODateTimeString = string;
export type V2ContractVersion = 'v2';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export type QASessionStatusV2 = 'draft' | 'active' | 'readyForReview' | 'approved' | 'archived';

export type QASessionPhaseV2 =
  | 'import'
  | 'exploration'
  | 'formulaDraft'
  | 'reconciliation'
  | 'evidence'
  | 'review';

export type AuditActorRoleV2 = 'admin' | 'qa' | 'reviewer' | 'system' | (string & {});

export interface AuditActorV2 {
  id: string;
  displayName: string;
  role: AuditActorRoleV2;
  email?: string;
}

export type AuditEntityTypeV2 =
  | 'session'
  | 'import'
  | 'filter'
  | 'formula'
  | 'scenario'
  | 'evidence'
  | 'reconciliation'
  | 'tooltip'
  | (string & {});

export interface AuditEntityRefV2 {
  type: AuditEntityTypeV2;
  id: string;
  label?: string;
}

export interface AuditSnapshotV2 {
  label: string;
  values: JsonObject;
  redactedFields?: string[];
}

export type AuditEventActionV2 =
  | 'session.created'
  | 'session.updated'
  | 'import.fingerprinted'
  | 'filters.changed'
  | 'formula.draft.edited'
  | 'formula.draft.validated'
  | 'formula.draft.applied'
  | 'scenario.risk.scored'
  | 'evidence.captured'
  | 'evidence.packaged'
  | 'review.completed'
  | (string & {});

export interface AuditEventV2 {
  contractVersion: V2ContractVersion;
  id: string;
  sessionId: string;
  occurredAt: ISODateTimeString;
  actor: AuditActorV2;
  action: AuditEventActionV2;
  entity: AuditEntityRefV2;
  summary: string;
  detail?: string;
  before?: AuditSnapshotV2;
  after?: AuditSnapshotV2;
  evidenceItemIds?: string[];
  metadata?: JsonObject;
}

export type FormulaDraftStatusV2 = 'clean' | 'dirty' | 'validating' | 'valid' | 'invalid' | 'applied';
export type FormulaDraftMetricStateV2 = 'unchanged' | 'edited' | 'validated' | 'invalid' | 'applied';

export interface FormulaDraftMetricV2 {
  metricId: string;
  visualId: string;
  visualName: string;
  metricName: string;
  chartElement: string;
  productionFormula: string;
  draftFormula: string;
  sourceFields: string[];
  absUsed: boolean;
  state: FormulaDraftMetricStateV2;
  validation: FormulaValidation | null;
  updatedAt: ISODateTimeString | null;
  updatedBy: AuditActorV2 | null;
  reason: string | null;
}

export interface FormulaDraftStateV2 {
  contractVersion: V2ContractVersion;
  revision: number;
  status: FormulaDraftStatusV2;
  baselineLogicVersion: LogicVersion;
  previewLogicVersion: LogicVersion;
  lastEditedAt: ISODateTimeString | null;
  lastEditedBy: AuditActorV2 | null;
  metrics: Record<string, FormulaDraftMetricV2>;
  validationErrors: string[];
  validationWarnings: string[];
}

export type EvidencePackageStatusV2 = 'collecting' | 'ready' | 'exported' | 'sealed';
export type EvidenceItemKindV2 = 'screenshot' | 'export' | 'note' | 'dataSample' | 'formulaDiff' | 'reconciliation' | 'scenario';

export interface EvidencePackageSummaryV2 {
  itemCount: number;
  screenshotCount: number;
  scenarioCount: number;
  formulaChangeCount: number;
  reconciliationRowCount: number;
}

export interface EvidenceItemV2 {
  id: string;
  kind: EvidenceItemKindV2;
  label: string;
  capturedAt: ISODateTimeString;
  capturedBy: AuditActorV2 | null;
  path?: string;
  url?: string;
  mimeType?: string;
  checksum?: string;
  description?: string;
  relatedScenarioIds: string[];
  relatedMetricIds: string[];
  relatedRowIds: number[];
  metadata?: JsonObject;
}

export interface EvidencePackageV2 {
  contractVersion: V2ContractVersion;
  id: string;
  sessionId: string;
  title: string;
  status: EvidencePackageStatusV2;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
  importFingerprintId: string | null;
  items: EvidenceItemV2[];
  summary: EvidencePackageSummaryV2;
  exportedAt: ISODateTimeString | null;
  exportedBy: AuditActorV2 | null;
}

export type ImportSourceKindV2 = 'workbook' | 'csv' | 'manual' | 'sample' | 'unknown';

export interface ImportFingerprintV2 {
  contractVersion: V2ContractVersion;
  id: string;
  sourceKind: ImportSourceKindV2;
  fileName: string;
  workbookName: string | null;
  sheetName: string | null;
  fileSizeBytes: number | null;
  lastModifiedAt: ISODateTimeString | null;
  importedAt: ISODateTimeString;
  contentHash: string | null;
  schemaHash: string | null;
  rowCount: number;
  investorCount: number;
  programCount: number;
  columns: string[];
  normalizedColumns: string[];
  missingColumns: string[];
  extraColumns: string[];
  validationIssues: string[];
}

export type ScenarioRiskLevelV2 = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface ScenarioRiskDriverV2 {
  id: string;
  label: string;
  weight: number;
  scoreImpact: number;
  evidenceItemIds: string[];
}

export interface ScenarioRiskScoreV2 {
  contractVersion: V2ContractVersion;
  scenarioId: string;
  scenarioName: string;
  severity: Severity;
  supportStatus: SupportStatus;
  riskLevel: ScenarioRiskLevelV2;
  score: number;
  affectedInvestorCount: number;
  affectedRowCount: number;
  chartIds: string[];
  drivers: ScenarioRiskDriverV2[];
  evidenceItemIds: string[];
  lastCalculatedAt: ISODateTimeString;
  notes?: string;
}

export type TooltipSignTreatmentV2 = 'signed' | 'absolute' | 'negated' | 'ratio' | 'unknown';

export interface TooltipContextV2 {
  contractVersion: V2ContractVersion;
  id: string;
  chartId: string;
  metricKey: string;
  metricName: string;
  label: string;
  value: number;
  formattedValue: string;
  rawValue: number | string | null;
  color: string | null;
  logicVersion: LogicVersion;
  formulaMetricId: string | null;
  formula: string | null;
  signTreatment: TooltipSignTreatmentV2;
  sourceFields: string[];
  scenarioIds: string[];
  evidenceItemIds: string[];
  rowIds: number[];
  importFingerprintId: string | null;
  metadata?: JsonObject;
}

export interface QASessionV2 {
  contractVersion: V2ContractVersion;
  id: string;
  title: string;
  status: QASessionStatusV2;
  phase: QASessionPhaseV2;
  owner: AuditActorV2 | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
  importFingerprint: ImportFingerprintV2 | null;
  filters: DashboardFilters;
  activeTab: ChartTab;
  logicVersion: LogicVersion;
  formulaDraft: FormulaDraftStateV2;
  scenarioRiskScores: ScenarioRiskScoreV2[];
  evidencePackage: EvidencePackageV2;
  auditTrail: AuditEventV2[];
  notes: string[];
}
