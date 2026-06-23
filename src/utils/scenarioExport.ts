import type { InvestorScenarioRecord, ScenarioModel } from '../types';
import { downloadBlob, downloadTextFile } from './format';
import { SCENARIO_VISUALS } from './scenarioClassifier';

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function money(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : '';
}

function slug(label: string): string {
  return label.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-+|-+$/g, '') || 'scenario';
}

export const SCENARIO_MEMBERS_COLUMNS = [
  'Short Code', 'Investor', 'Fund', 'Contributions', 'Distributions', 'Commitments', 'Capital Account', 'Total Value',
] as const;

/**
 * Request 1 — the membership table exactly as shown (Short code, Investor,
 * Fund, and the metric columns), with the visual + scenario as context. Pure
 * so the columns/context are unit-tested.
 */
export function buildScenarioMembersCsv(args: {
  visualTitle: string;
  scenarioLabel: string;
  records: InvestorScenarioRecord[];
}): string {
  const { visualTitle, scenarioLabel, records } = args;
  const lines: string[] = [];
  lines.push(['Visual', 'Scenario', 'Investors'].map(csvCell).join(','));
  lines.push([visualTitle, scenarioLabel, String(records.length)].map(csvCell).join(','));
  lines.push('');
  lines.push(SCENARIO_MEMBERS_COLUMNS.map(csvCell).join(','));
  for (const record of records) {
    lines.push([
      record.shortCode ?? '', record.portalName ?? '', record.fund ?? '',
      money(record.metrics.contributions), money(record.metrics.distributions), money(record.metrics.commitments),
      money(record.metrics.capitalAccountBalance), money(record.metrics.totalValue),
    ].map(csvCell).join(','));
  }
  return lines.join('\r\n');
}

export function exportScenarioMembersCsv(args: {
  fileBase: string;
  visualTitle: string;
  scenarioLabel: string;
  records: InvestorScenarioRecord[];
}): void {
  downloadTextFile(`${args.fileBase}-${slug(args.scenarioLabel)}.csv`, buildScenarioMembersCsv(args), 'text/csv;charset=utf-8');
}

/**
 * Request 2 — export every visual and its scenarios as a workbook: one sheet
 * per visual (each scenario with its investor count and short codes), plus a
 * Scenario Detail sheet (one row per investor with its label + metrics for
 * every visual). Mirrors the source RRE Scenarios.xlsx.
 */
export async function exportScenarioWorkbook(model: ScenarioModel, fileBase: string): Promise<void> {
  const XLSX = await import('@e965/xlsx');
  const total = Object.keys(model.recordByInvestor).length;
  const wb = XLSX.utils.book_new();

  for (const visual of SCENARIO_VISUALS) {
    const rows: (string | number)[][] = [['Scenario', 'Investors', 'Share', 'Investor Short Codes']];
    for (const bucket of model.byVisual[visual.id]) {
      const codes = bucket.investorKeys
        .map((key) => model.recordByInvestor[key]?.shortCode ?? key)
        .join(', ');
      const share = total ? `${Math.round((bucket.count / total) * 100)}%` : '0%';
      rows.push([bucket.label, bucket.count, share, codes]);
    }
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = [{ wch: 56 }, { wch: 10 }, { wch: 8 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(wb, sheet, visual.title.slice(0, 31));
  }

  const detail: (string | number)[][] = [[
    'Short Code', 'Fund', 'Investor',
    'Cash Flow Scenario', 'Commitment Scenario', 'Ratio Scenario', 'Total Value Scenario', 'Capital At Work Scenario',
    'Contributions', 'Distributions', 'Total Commitments', 'Available Unfunded', 'Capital Account Balance',
    'Total Value', 'Capital At Work', 'Non-Recallable Distributions', 'Called Capital',
  ]];
  for (const record of Object.values(model.recordByInvestor).sort(
    (a, b) => (a.fund ?? '').localeCompare(b.fund ?? '') || (a.shortCode ?? '').localeCompare(b.shortCode ?? ''),
  )) {
    const m = record.metrics;
    detail.push([
      record.shortCode ?? '', record.fund ?? '', record.portalName ?? '',
      record.labels.cashFlow, record.labels.commitment, record.labels.ratio, record.labels.totalValue, record.labels.capitalAtWork,
      round(m.contributions), round(m.distributions), round(m.commitments), round(m.unfunded), round(m.capitalAccountBalance),
      round(m.totalValue), round(m.capitalAtWork), round(m.nonRecallable), round(m.calledCapital),
    ]);
  }
  const detailSheet = XLSX.utils.aoa_to_sheet(detail);
  XLSX.utils.book_append_sheet(wb, detailSheet, 'Scenario Detail');

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  downloadBlob(`${fileBase}-scenarios.xlsx`, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

function round(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}
