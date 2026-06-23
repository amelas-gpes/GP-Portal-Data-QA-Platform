import type { FieldActivationStatus, FormulaFieldReference } from '../types';
import { DEFAULT_FORMULA_REGISTRY } from './defaultLogic';
import { EXPECTED_COLUMNS, FIELD_TO_HEADER, HEADER_TO_KEY, NUMERIC_KEYS, type NumericKey } from './columns';

const REQUIRED_FIELD_HEADERS = new Set<string>(EXPECTED_COLUMNS);
const CURRENT_VISUAL_FIELDS = new Set(
  Object.values(DEFAULT_FORMULA_REGISTRY).flatMap((metric) => metric.sourceFields),
);

export function getFieldActivationInfo(field: string): FormulaFieldReference {
  const header = fieldToHeader(field);
  const normalizedKey = fieldToKeyName(field);
  const isImported = REQUIRED_FIELD_HEADERS.has(header);
  const status = fieldStatus(header, isImported);
  return {
    field,
    header,
    status,
    statusLabel: statusLabel(status),
    detail: statusDetail(status),
    canCalculate: Boolean(normalizedKey && NUMERIC_KEYS.includes(normalizedKey as NumericKey)),
  };
}

export function activationStatusClass(status: FieldActivationStatus): string {
  if (status === 'needsActivation') return 'needs-activation';
  return status;
}

export function activationSummary(fields: FormulaFieldReference[]): string {
  if (!fields.length) return 'No BI fields referenced.';
  const current = fields.filter((field) => field.status === 'current').length;
  const needsActivation = fields.filter((field) => field.status === 'needsActivation').length;
  const unknown = fields.filter((field) => field.status === 'unknown').length;
  return [
    current ? `${current} current` : '',
    needsActivation ? `${needsActivation} activation needed` : '',
    unknown ? `${unknown} unknown` : '',
  ].filter(Boolean).join(', ');
}

function fieldStatus(header: string, isImported: boolean): FieldActivationStatus {
  if (CURRENT_VISUAL_FIELDS.has(header)) return 'current';
  if (isImported) return 'needsActivation';
  return 'unknown';
}

function fieldToHeader(field: string): string {
  if (field in HEADER_TO_KEY) return field;
  return FIELD_TO_HEADER[field] ?? field;
}

function fieldToKeyName(field: string): string | null {
  if (field in HEADER_TO_KEY) return HEADER_TO_KEY[field as keyof typeof HEADER_TO_KEY];
  if (field in FIELD_TO_HEADER) return field;
  return null;
}

function statusLabel(status: FieldActivationStatus): string {
  if (status === 'current') return 'Current';
  if (status === 'needsActivation') return 'Activation needed';
  return 'Unknown';
}

function statusDetail(status: FieldActivationStatus): string {
  if (status === 'current') return 'Used by the current production visual logic.';
  if (status === 'needsActivation') return 'Imported in the BI file, but not used by current production visual logic.';
  return 'Not found in the BI import contract.';
}
