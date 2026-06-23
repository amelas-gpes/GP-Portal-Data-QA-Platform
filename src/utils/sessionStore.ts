import type { ImportFingerprintV2, ImportSummary } from '../types';
import { createImportFingerprint } from './sessionTypes';

const LEGACY_SESSION_DB_NAME = 'gp-portal-data-qa-session';

export async function clearStoredSessionData(): Promise<void> {
  const idb = getIndexedDb();
  if (!idb) return;

  try {
    await deleteIndexedDb(idb, LEGACY_SESSION_DB_NAME);
  } catch {
    // Best-effort cleanup only. A blocked delete should not stop a fresh import session.
  }
}

export async function createSessionFileFingerprint(file: File, summary: ImportSummary): Promise<ImportFingerprintV2> {
  return createImportFingerprint({
    fileName: file.name,
    fileSizeBytes: file.size,
    lastModifiedAt: file.lastModified ? new Date(file.lastModified).toISOString() : null,
    contentHash: await hashFileContent(file),
    summary,
    validation: summary.validation,
  });
}

async function deleteIndexedDb(idb: IDBFactory, dbName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = idb.deleteDatabase(dbName);
    } catch (error) {
      reject(error);
      return;
    }

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('IndexedDB session data could not be cleared.'));
    request.onblocked = () => reject(new Error('IndexedDB session data cleanup was blocked.'));
  });
}

// SubtleCrypto cannot stream, so hashing duplicates the whole file in
// main-thread memory right when the import worker is at peak usage. Above this
// size the fingerprint falls back to name/size/mtime identity instead.
const MAX_HASHABLE_FILE_BYTES = 64 * 1024 * 1024;

async function hashFileContent(file: File): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  if (file.size > MAX_HASHABLE_FILE_BYTES) return null;

  try {
    const digest = await subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

function getIndexedDb(): IDBFactory | null {
  return globalThis.indexedDB ?? null;
}
