import { describe, expect, it } from 'vitest';
import {
  auditLogActions,
  createAuditLog,
  diffSnapshotKeys,
  exportAuditLog,
  recordDraftApply,
  recordDraftEdit,
  recordDraftReset,
  recordExport,
  recordFilterChange,
  recordImport,
  recordInvestorSelection,
  recordScenarioJump,
  serializeAuditLogExport,
  type AuditLog,
  type ExportAuditDetails,
  type FilterChangeAuditDetails,
  type InvestorSelectionAuditDetails,
} from '../utils/auditLog';

const actor = { id: 'qa-1', displayName: 'QA Reviewer', role: 'qa' as const };

describe('append-only audit log', () => {
  it('appends events in action order without sorting by timestamp', () => {
    const empty = createAuditLog({ createdAt: '2026-05-20T10:00:00.000Z' });
    const afterImport = recordImport(empty, {
      actor,
      occurredAt: '2026-05-20T10:05:00.000Z',
      fileName: 'ANONYMIZED DATA.xlsx',
      rowCount: 120,
      investorCount: 3,
      programCount: 2,
      validationIssueCount: 1,
      contentHash: 'hash-a',
      schemaHash: 'schema-a',
    });
    const afterFilter = recordFilterChange(afterImport, {
      actor,
      occurredAt: '2026-05-20T09:59:00.000Z',
      before: { investorType: '', cumulative: true },
      after: { investorType: 'LP', cumulative: true },
    });

    expect(empty.events).toHaveLength(0);
    expect(afterImport.events.map((event) => event.sequence)).toEqual([1]);
    expect(afterFilter.events.map((event) => event.sequence)).toEqual([1, 2]);
    expect(afterFilter.events.map((event) => event.action)).toEqual([
      auditLogActions.importCompleted,
      auditLogActions.filtersChanged,
    ]);
    expect(afterFilter.updatedAt).toBe('2026-05-20T09:59:00.000Z');
  });

  it('captures filter before/after snapshots and changed keys as exported data', () => {
    const before = { investorType: '', groupingMode: 'investorFundPairing', cumulative: true };
    const after = { investorType: 'GP', groupingMode: 'groupCode', cumulative: true };
    const log = recordFilterChange(createAuditLog(), { before, after });
    before.investorType = 'LP';

    const details = log.events[0].details as FilterChangeAuditDetails;
    expect(details.changedKeys).toEqual(['groupingMode', 'investorType']);
    expect(details.before).toEqual({ investorType: '', groupingMode: 'investorFundPairing', cumulative: true });
    expect(details.after).toEqual(after);
  });

  it('computes investor selection additions and removals', () => {
    const log = recordInvestorSelection(createAuditLog(), {
      beforeInvestorKeys: ['INV-1', 'INV-2'],
      afterInvestorKeys: ['INV-2', 'INV-3'],
    });

    const details = log.events[0].details as InvestorSelectionAuditDetails;
    expect(details.addedInvestorKeys).toEqual(['INV-3']);
    expect(details.removedInvestorKeys).toEqual(['INV-1']);
  });

  it('records draft edits, apply and reset actions, scenario jumps, and exports', () => {
    const actions: Array<(current: AuditLog) => AuditLog> = [
      (current) => recordDraftEdit(current, {
        actor,
        metricId: 'cashFlowSummary.Contributions',
        visualId: 'cashFlowSummary',
        metricName: 'Contributions',
        beforeFormula: 'ABS(SUM("Actual Contributions"))',
        afterFormula: 'SUM("Total Contributions")',
        validationStatus: 'valid',
      }),
      (current) => recordDraftApply(current, {
        actor,
        metricIds: ['cashFlowSummary.Contributions'],
        reason: 'Preview imported Total Contributions field.',
      }),
      (current) => recordDraftReset(current, {
        actor,
        metricIds: ['cashFlowSummary.Contributions'],
        resetScope: 'metric',
      }),
      (current) => recordScenarioJump(current, {
        actor,
        scenarioId: 'CD-003',
        scenarioName: 'GP Total Value source field',
        fromInvestorKeys: ['INV-1'],
        toInvestorKeys: ['INV-9'],
        targetTab: 'scenarios',
      }),
      (current) => recordExport(current, {
        actor,
        exportName: 'bi-visual-qa-results.json',
        includedSections: ['filters', 'selectedInvestors', 'auditLog'],
      }),
    ];
    const log = actions.reduce((current, apply) => apply(current), createAuditLog());

    expect(log.events.map((event) => event.action)).toEqual([
      auditLogActions.draftEdited,
      auditLogActions.draftApplied,
      auditLogActions.draftReset,
      auditLogActions.scenarioJumped,
      auditLogActions.exportCreated,
    ]);
    expect((log.events[4].details as ExportAuditDetails).eventCountBeforeExport).toBe(4);
  });

  it('builds a stable export payload and serializes the same shape', () => {
    const log = recordImport(createAuditLog({ createdAt: '2026-05-20T10:00:00.000Z' }), {
      occurredAt: '2026-05-20T10:01:00.000Z',
      fileName: 'source.csv',
      rowCount: 10,
      investorCount: 2,
      programCount: 1,
    });
    const exported = exportAuditLog(log, '2026-05-20T10:02:00.000Z');
    const serialized = JSON.parse(serializeAuditLogExport(log, '2026-05-20T10:02:00.000Z'));

    expect(exported).toEqual(serialized);
    expect(exported).toMatchObject({
      schemaVersion: 'gp-portal-audit-log.v1',
      exportedAt: '2026-05-20T10:02:00.000Z',
      eventCount: 1,
      events: [{ action: auditLogActions.importCompleted, sequence: 1 }],
    });
  });

  it('diffs nested snapshots with stable key ordering', () => {
    expect(
      diffSnapshotKeys(
        { filters: { currency: 'USD', type: 'LP' }, selected: ['A'] },
        { filters: { type: 'LP', currency: 'USD' }, selected: ['A', 'B'] },
      ),
    ).toEqual(['selected']);
  });
});
