import type {
  AuditActorV2,
  AuditEntityRefV2,
  AuditEntityTypeV2,
  AuditEventActionV2,
  AuditEventV2,
  AuditSnapshotV2,
  ISODateTimeString,
  JsonObject,
  QASessionV2,
} from '../types';
import { createContractId, nowIso, QA_CONTRACT_VERSION } from './sessionTypes';

export interface CreateAuditEventInput {
  sessionId: string;
  actor: AuditActorV2;
  action: AuditEventActionV2;
  entity: AuditEntityRefV2;
  summary: string;
  id?: string;
  occurredAt?: ISODateTimeString;
  detail?: string;
  before?: AuditSnapshotV2;
  after?: AuditSnapshotV2;
  evidenceItemIds?: string[];
  metadata?: JsonObject;
}

export interface CreateAuditSnapshotInput {
  label: string;
  values: JsonObject;
  redactedFields?: string[];
}

export function createAuditEntity(type: AuditEntityTypeV2, id: string, label?: string): AuditEntityRefV2 {
  return label ? { type, id, label } : { type, id };
}

export function createAuditSnapshot(input: CreateAuditSnapshotInput): AuditSnapshotV2 {
  return {
    label: input.label,
    values: input.values,
    redactedFields: input.redactedFields,
  };
}

export function createAuditEvent(input: CreateAuditEventInput): AuditEventV2 {
  const occurredAt = input.occurredAt ?? nowIso();
  return {
    contractVersion: QA_CONTRACT_VERSION,
    id: input.id ?? createContractId('audit', occurredAt),
    sessionId: input.sessionId,
    occurredAt,
    actor: input.actor,
    action: input.action,
    entity: input.entity,
    summary: input.summary,
    detail: input.detail,
    before: input.before,
    after: input.after,
    evidenceItemIds: input.evidenceItemIds,
    metadata: input.metadata,
  };
}

export function appendAuditEvent(
  session: QASessionV2,
  event: AuditEventV2,
  timestamp: ISODateTimeString = event.occurredAt,
): QASessionV2 {
  return {
    ...session,
    updatedAt: timestamp,
    auditTrail: sortAuditEvents([...session.auditTrail, event]),
  };
}

export function sortAuditEvents(events: AuditEventV2[]): AuditEventV2[] {
  return [...events].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
}

export function auditEventHasAction(event: AuditEventV2, action: AuditEventActionV2): boolean {
  return event.action === action;
}
