export type PerformanceStage = 'import' | 'compute' | 'reconciliation';
export type PerformanceStatus = 'success' | 'failed' | 'cancelled' | 'stale';

export type PerformanceMarkHandle = {
  stage: PerformanceStage;
  requestId: number;
  startMark: string;
};

const MARK_PREFIX = 'gp-portal-bi';

export function startPerformanceMark(stage: PerformanceStage, requestId: number): PerformanceMarkHandle {
  const startMark = `${MARK_PREFIX}:${stage}:${requestId}:start`;
  if (canUsePerformanceTimeline()) performance.mark(startMark);
  return { stage, requestId, startMark };
}

export function finishPerformanceMark(handle: PerformanceMarkHandle, status: PerformanceStatus): void {
  if (!canUsePerformanceTimeline()) return;
  const endMark = `${MARK_PREFIX}:${handle.stage}:${handle.requestId}:${status}`;
  const measureName = `${MARK_PREFIX}:${handle.stage}:${status}`;
  try {
    performance.mark(endMark);
    performance.measure(measureName, handle.startMark, endMark);
  } catch {
    // Performance marks are diagnostic only; never let them affect dashboard behavior.
  } finally {
    performance.clearMarks(handle.startMark);
    performance.clearMarks(endMark);
  }
}

function canUsePerformanceTimeline(): boolean {
  return typeof performance !== 'undefined' && typeof performance.mark === 'function' && typeof performance.measure === 'function';
}
