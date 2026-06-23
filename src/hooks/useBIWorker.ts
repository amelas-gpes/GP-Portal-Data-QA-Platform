import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ChartBundle,
  ChartBundleSet,
  FormulaRegistry,
  ImportProgress,
  ImportSummary,
  ReconciliationSummary,
  WorkerComparePayload,
  WorkerComputeBundleSetPayload,
  WorkerComputePayload,
  WorkerImportPayload,
} from '../types';
import { finishPerformanceMark, startPerformanceMark, type PerformanceMarkHandle, type PerformanceStage, type PerformanceStatus } from '../utils/performanceMarks';

type WorkerRequestType = 'import' | 'compute' | 'computeBundleSet' | 'compare';

type PendingRequest = {
  type: WorkerRequestType;
  sequence: number;
  performanceMark: PerformanceMarkHandle;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

type WorkerMessage = {
  id: number;
  ok: boolean;
  payload?: unknown;
  error?: string;
  type?: string;
  progress?: ImportProgress;
};

const performanceStageByRequestType: Record<WorkerRequestType, PerformanceStage> = {
  import: 'import',
  compute: 'compute',
  computeBundleSet: 'compute',
  compare: 'reconciliation',
};

const requestLabelByType: Record<WorkerRequestType, string> = {
  import: 'import',
  compute: 'compute',
  computeBundleSet: 'chart update',
  compare: 'reconciliation',
};

const supersedableRequestTypes = new Set<WorkerRequestType>(['compute', 'computeBundleSet', 'compare']);

function emptyRequestIds(): Record<WorkerRequestType, number | null> {
  return { import: null, compute: null, computeBundleSet: null, compare: null };
}

function emptyRequestSequences(): Record<WorkerRequestType, number> {
  return { import: 0, compute: 0, computeBundleSet: 0, compare: 0 };
}

function createCancelledRequestError(message: string): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

export function useBIWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, PendingRequest>());
  const idRef = useRef(1);
  const latestRequestIdByType = useRef(emptyRequestIds());
  const requestSequenceByType = useRef(emptyRequestSequences());
  const readyRef = useRef<Promise<void>>(Promise.resolve());
  const readyResolveRef = useRef<(() => void) | null>(null);
  const readyRejectRef = useRef<((reason?: unknown) => void) | null>(null);
  const readyTimeoutRef = useRef<number | null>(null);
  const consecutiveWorkerFailuresRef = useRef(0);
  const replaceFailedWorkerRef = useRef<(failedWorker: Worker) => void>(() => undefined);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);

  const rejectPendingRequest = useCallback((id: number, error: Error, status: PerformanceStatus) => {
    const request = pending.current.get(id);
    if (!request) return;
    pending.current.delete(id);
    if (latestRequestIdByType.current[request.type] === id) latestRequestIdByType.current[request.type] = null;
    finishPerformanceMark(request.performanceMark, status);
    request.reject(error);
  }, []);

  const rejectPendingRequests = useCallback((error: Error, status: PerformanceStatus, type?: WorkerRequestType) => {
    const requestIds = Array.from(pending.current.entries())
      .filter(([, request]) => !type || request.type === type)
      .map(([id]) => id);
    for (const id of requestIds) {
      const nextError = status === 'cancelled' || status === 'stale' ? createCancelledRequestError(error.message) : error;
      rejectPendingRequest(id, nextError, status);
    }
  }, [rejectPendingRequest]);

  const failPendingRequests = useCallback((error: Error) => {
    rejectPendingRequests(error, 'failed');
    latestRequestIdByType.current = emptyRequestIds();
    setImportProgress(null);
  }, [rejectPendingRequests]);

  const createWorker = useCallback(() => {
    const worker = new Worker(new URL('../workers/importWorker.ts', import.meta.url), { type: 'module' });
    readyRef.current = new Promise<void>((resolve, reject) => {
      readyResolveRef.current = resolve;
      readyRejectRef.current = reject;
    });
    readyRef.current.catch(() => undefined);
    if (readyTimeoutRef.current !== null) window.clearTimeout(readyTimeoutRef.current);
    readyTimeoutRef.current = window.setTimeout(() => {
      const error = new Error('The import engine did not start cleanly.');
      readyRejectRef.current?.(error);
      failPendingRequests(error);
      replaceFailedWorkerRef.current(worker);
    }, 15_000);
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (event.data.type === 'pong') {
        if (readyTimeoutRef.current !== null) window.clearTimeout(readyTimeoutRef.current);
        readyTimeoutRef.current = null;
        consecutiveWorkerFailuresRef.current = 0;
        readyResolveRef.current?.();
        return;
      }
      if (event.data.type === 'import-progress' && event.data.progress) {
        const request = pending.current.get(event.data.id);
        if (request?.type === 'import' && latestRequestIdByType.current.import === event.data.id) {
          setImportProgress(event.data.progress);
        }
        return;
      }
      const request = pending.current.get(event.data.id);
      if (!request) return;
      if (request.sequence !== requestSequenceByType.current[request.type]) {
        rejectPendingRequest(event.data.id, createCancelledRequestError(`A newer ${requestLabelByType[request.type]} request completed first.`), 'stale');
        return;
      }
      pending.current.delete(event.data.id);
      if (latestRequestIdByType.current[request.type] === event.data.id) latestRequestIdByType.current[request.type] = null;
      if (event.data.ok) {
        if (event.data.type === 'import') setImportProgress(null);
        finishPerformanceMark(request.performanceMark, 'success');
        request.resolve(event.data.payload);
      }
      else {
        if (event.data.type === 'import') setImportProgress(null);
        finishPerformanceMark(request.performanceMark, 'failed');
        request.reject(new Error(event.data.error ?? 'Worker request failed.'));
      }
    };
    worker.onerror = (event) => {
      if (readyTimeoutRef.current !== null) window.clearTimeout(readyTimeoutRef.current);
      readyTimeoutRef.current = null;
      const message = event.message || 'The import engine stopped before it could read the file.';
      const error = new Error(message);
      readyRejectRef.current?.(error);
      failPendingRequests(error);
      replaceFailedWorkerRef.current(worker);
    };
    worker.onmessageerror = () => {
      if (readyTimeoutRef.current !== null) window.clearTimeout(readyTimeoutRef.current);
      readyTimeoutRef.current = null;
      const error = new Error('The import engine could not receive the file.');
      readyRejectRef.current?.(error);
      failPendingRequests(error);
      replaceFailedWorkerRef.current(worker);
    };
    worker.postMessage({ id: 0, type: 'ping', payload: null });
    return worker;
  }, [failPendingRequests, rejectPendingRequest]);

  // A worker killed by the OS (the realistic failure for very large imports)
  // never recovers on its own; without a replacement every later request posts
  // into a dead worker and hangs forever. Replace it, but stop once startup
  // itself looks broken so a crashing worker script cannot recreate in a loop.
  // Declared before the mount effect below so the handler exists before any
  // worker can fire onerror.
  useEffect(() => {
    replaceFailedWorkerRef.current = (failedWorker: Worker) => {
      if (workerRef.current !== failedWorker) return;
      failedWorker.terminate();
      consecutiveWorkerFailuresRef.current += 1;
      if (consecutiveWorkerFailuresRef.current >= 3) {
        workerRef.current = null;
        return;
      }
      workerRef.current = createWorker();
    };
  }, [createWorker]);

  useEffect(() => {
    const worker = createWorker();
    workerRef.current = worker;
    return () => {
      if (readyTimeoutRef.current !== null) window.clearTimeout(readyTimeoutRef.current);
      rejectPendingRequests(createCancelledRequestError('Import worker stopped.'), 'cancelled');
      worker.terminate();
      workerRef.current = null;
    };
  }, [createWorker, rejectPendingRequests]);

  const request = useCallback(async <T,>(type: WorkerRequestType, payload: unknown): Promise<T> => {
    if (!workerRef.current) return Promise.reject(new Error('Import worker is not ready yet.'));
    if (type === 'import' && latestRequestIdByType.current.import !== null) {
      return Promise.reject(new Error('An import is already running. Cancel it before starting another import.'));
    }
    const id = idRef.current;
    idRef.current += 1;
    const sequence = requestSequenceByType.current[type] + 1;
    requestSequenceByType.current[type] = sequence;
    if (supersedableRequestTypes.has(type)) {
      rejectPendingRequests(createCancelledRequestError(`A newer ${requestLabelByType[type]} request started.`), 'cancelled', type);
    }
    latestRequestIdByType.current[type] = id;
    if (type === 'import') {
      setImportProgress({ phase: 'Starting import worker', detail: 'Checking that the local import worker is ready.', startedAt: Date.now() });
    }
    try {
      await readyRef.current;
    } catch (error) {
      if (latestRequestIdByType.current[type] === id) latestRequestIdByType.current[type] = null;
      throw error;
    }
    if (sequence !== requestSequenceByType.current[type]) {
      if (latestRequestIdByType.current[type] === id) latestRequestIdByType.current[type] = null;
      throw createCancelledRequestError(`A newer ${requestLabelByType[type]} request started.`);
    }
    if (type === 'import') {
      setImportProgress({ phase: 'Queued import', detail: 'Sending the selected file to the local import worker.', startedAt: Date.now() });
    }
    return new Promise<T>((resolve, reject) => {
      const worker = workerRef.current;
      if (!worker) {
        reject(new Error('Import worker is not ready yet.'));
        return;
      }
      const performanceMark = startPerformanceMark(performanceStageByRequestType[type], id);
      pending.current.set(id, { type, sequence, performanceMark, resolve: resolve as (value: unknown) => void, reject });
      latestRequestIdByType.current[type] = id;
      try {
        worker.postMessage({ id, type, payload });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The import engine could not receive the request.';
        rejectPendingRequest(id, new Error(message), 'failed');
      }
    });
  }, [rejectPendingRequest, rejectPendingRequests]);

  const resetWorker = useCallback((message = 'Import cancelled.') => {
    for (const type of Object.keys(requestSequenceByType.current) as WorkerRequestType[]) {
      requestSequenceByType.current[type] += 1;
    }
    rejectPendingRequests(createCancelledRequestError(message), 'cancelled');
    latestRequestIdByType.current = emptyRequestIds();
    consecutiveWorkerFailuresRef.current = 0;
    workerRef.current?.terminate();
    workerRef.current = createWorker();
    setImportProgress(null);
  }, [createWorker, rejectPendingRequests]);

  const importWorkbook = useCallback(
    (file: File, formulas: FormulaRegistry) => request<ImportSummary>('import', { file, formulas } satisfies WorkerImportPayload),
    [request],
  );

  const computeBundle = useCallback(
    (payload: WorkerComputePayload) => request<ChartBundle>('compute', payload),
    [request],
  );

  const computeBundleSet = useCallback(
    (payload: WorkerComputeBundleSetPayload) => request<ChartBundleSet>('computeBundleSet', payload),
    [request],
  );

  const compareLogic = useCallback(
    (payload: WorkerComparePayload) => request<ReconciliationSummary>('compare', payload),
    [request],
  );

  return useMemo(
    () => ({
      importWorkbook,
      computeBundle,
      computeBundleSet,
      compareLogic,
      resetWorker,
      importProgress,
    }),
    [compareLogic, computeBundle, computeBundleSet, importProgress, importWorkbook, resetWorker],
  );
}
