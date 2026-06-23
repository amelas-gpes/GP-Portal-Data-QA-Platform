import { useCallback, useEffect, useMemo, useRef } from 'react';

// Browser-style investor visit history, derived from the current selection —
// reducer-free by design (App.tsx owns wiring; sessionReducer is untouched).
// Every currentKey change is recorded (j/k steps included) with immediate
// repeats deduped; going back and then visiting somewhere new truncates the
// forward stack, exactly like a browser. All bookkeeping lives in refs so
// recording a visit is O(1), allocation-light, and never re-renders the stage.

const HISTORY_LIMIT = 100;
const RECENT_LIMIT = 8;

export type InvestorHistoryApi = {
  /** Walk back one visit. Returns false when there is nowhere to go back to. */
  back: () => boolean;
  /** Walk forward one visit. Returns false when the forward stack is empty. */
  forward: () => boolean;
  /**
   * Most-recently-visited keys, newest first, deduped, capped. Includes the
   * current investor at [0] once its visit effect has run — callers rendering
   * a "Recent" list should filter out the active key themselves.
   */
  getRecent: () => string[];
  /** Forget everything — call when a new workbook import replaces the queue. */
  reset: () => void;
};

export function useInvestorHistory(
  currentKey: string | null,
  navigate: (investorKey: string) => void,
): InvestorHistoryApi {
  const entriesRef = useRef<string[]>([]);
  const cursorRef = useRef(-1);
  /** Key we are travelling to via back/forward — its arrival must not re-push. */
  const travelKeyRef = useRef<string | null>(null);
  /** Visit-recency list (differs from stack order once back/forward is used). */
  const recentRef = useRef<string[]>([]);

  useEffect(() => {
    if (!currentKey) return;
    const recent = recentRef.current;
    if (recent[0] !== currentKey) {
      const existing = recent.indexOf(currentKey);
      if (existing >= 0) recent.splice(existing, 1);
      recent.unshift(currentKey);
      if (recent.length > RECENT_LIMIT + 1) recent.length = RECENT_LIMIT + 1;
    }
    if (travelKeyRef.current === currentKey) {
      // Arrived via back/forward — the cursor already points at this entry.
      travelKeyRef.current = null;
      return;
    }
    travelKeyRef.current = null;
    const entries = entriesRef.current;
    if (entries[cursorRef.current] === currentKey) return; // dedupe immediate repeats
    entries.length = cursorRef.current + 1; // new navigation truncates the forward stack
    entries.push(currentKey);
    if (entries.length > HISTORY_LIMIT) entries.splice(0, entries.length - HISTORY_LIMIT);
    cursorRef.current = entries.length - 1;
  }, [currentKey]);

  const back = useCallback((): boolean => {
    if (cursorRef.current <= 0) return false;
    cursorRef.current -= 1;
    const key = entriesRef.current[cursorRef.current];
    travelKeyRef.current = key;
    navigate(key);
    return true;
  }, [navigate]);

  const forward = useCallback((): boolean => {
    if (cursorRef.current >= entriesRef.current.length - 1) return false;
    cursorRef.current += 1;
    const key = entriesRef.current[cursorRef.current];
    travelKeyRef.current = key;
    navigate(key);
    return true;
  }, [navigate]);

  const getRecent = useCallback((): string[] => recentRef.current.slice(), []);

  const reset = useCallback(() => {
    entriesRef.current = [];
    cursorRef.current = -1;
    travelKeyRef.current = null;
    recentRef.current = [];
  }, []);

  return useMemo(() => ({ back, forward, getRecent, reset }), [back, forward, getRecent, reset]);
}
