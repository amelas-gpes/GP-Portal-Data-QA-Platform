const STORAGE_KEY = 'gp-portal-investor-selection-v1';
const SCHEMA_VERSION = 1;
const MAX_SAVED_SELECTIONS = 12;
const MAX_RECENT_INVESTORS = 10;

export type SavedInvestorSelection = {
  id: string;
  name: string;
  keys: string[];
  createdAt: string;
  updatedAt: string;
};

export type InvestorSelectionState = {
  schemaVersion: number;
  savedSelections: SavedInvestorSelection[];
  recentInvestorKeys: string[];
};

export function emptyInvestorSelectionState(): InvestorSelectionState {
  return {
    schemaVersion: SCHEMA_VERSION,
    savedSelections: [],
    recentInvestorKeys: [],
  };
}

export function readInvestorSelectionState(): InvestorSelectionState {
  clearStoredInvestorSelectionState();
  return emptyInvestorSelectionState();
}

export function writeInvestorSelectionState(state: InvestorSelectionState): InvestorSelectionState {
  clearStoredInvestorSelectionState();
  return sanitizeInvestorSelectionState(state);
}

export function clearStoredInvestorSelectionState(): void {
  const storage = getLocalStorage();
  if (!storage) return;

  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort cleanup only. In-session selection state can still continue safely.
  }
}

export function saveInvestorSelection(
  state: InvestorSelectionState,
  name: string,
  keys: string[],
): InvestorSelectionState {
  const normalizedKeys = uniqueStrings(keys);
  if (!normalizedKeys.length) return sanitizeInvestorSelectionState(state);

  const now = new Date().toISOString();
  const cleanName = name.trim() || 'Investor selection';
  const existingIndex = state.savedSelections.findIndex((selection) => sameInvestorKeySet(selection.keys, normalizedKeys));
  const existing = existingIndex >= 0 ? state.savedSelections[existingIndex] : null;
  const savedSelection: SavedInvestorSelection = {
    id: existing?.id ?? createSelectionId(),
    name: cleanName,
    keys: normalizedKeys,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const savedSelections = [
    savedSelection,
    ...state.savedSelections.filter((_, index) => index !== existingIndex),
  ];

  return sanitizeInvestorSelectionState({
    ...state,
    savedSelections,
  });
}

export function deleteInvestorSelection(
  state: InvestorSelectionState,
  selectionId: string,
): InvestorSelectionState {
  return sanitizeInvestorSelectionState({
    ...state,
    savedSelections: state.savedSelections.filter((selection) => selection.id !== selectionId),
  });
}

export function recordRecentInvestorKeys(
  state: InvestorSelectionState,
  keys: string[],
): InvestorSelectionState {
  const recentKeys = uniqueStrings(keys);
  if (!recentKeys.length) return sanitizeInvestorSelectionState(state);

  return sanitizeInvestorSelectionState({
    ...state,
    recentInvestorKeys: [
      ...recentKeys,
      ...state.recentInvestorKeys.filter((key) => !recentKeys.includes(key)),
    ],
  });
}

export function filterAvailableInvestorKeys(keys: string[], availableKeys: Set<string>): string[] {
  return uniqueStrings(keys).filter((key) => availableKeys.has(key));
}

export function sameInvestorKeySet(left: string[], right: string[]): boolean {
  const leftSet = new Set(uniqueStrings(left));
  const rightSet = new Set(uniqueStrings(right));
  if (leftSet.size !== rightSet.size) return false;
  return Array.from(leftSet).every((key) => rightSet.has(key));
}

function sanitizeInvestorSelectionState(value: unknown): InvestorSelectionState {
  if (!isRecord(value)) return emptyInvestorSelectionState();

  return {
    schemaVersion: SCHEMA_VERSION,
    savedSelections: Array.isArray(value.savedSelections)
      ? value.savedSelections
        .map(normalizeSavedSelection)
        .filter((selection): selection is SavedInvestorSelection => Boolean(selection))
        .slice(0, MAX_SAVED_SELECTIONS)
      : [],
    recentInvestorKeys: Array.isArray(value.recentInvestorKeys)
      ? uniqueStrings(value.recentInvestorKeys).slice(0, MAX_RECENT_INVESTORS)
      : [],
  };
}

function normalizeSavedSelection(value: unknown): SavedInvestorSelection | null {
  if (!isRecord(value)) return null;
  const keys = Array.isArray(value.keys) ? uniqueStrings(value.keys) : [];
  if (!keys.length) return null;

  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id : createSelectionId(),
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim() : 'Investor selection',
    keys,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
  };
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const key = value.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(key);
  }
  return result;
}

function createSelectionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `selection-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
