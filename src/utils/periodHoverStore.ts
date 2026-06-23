// ── Synced period hover store ────────────────────────────────────────────────
// Tiny external store for the hovered period key shared across chart cards.
// It lives outside React state so a hover never re-renders the charts' full
// data path: only the per-chart highlight layers subscribe (via
// useSyncExternalStore in src/components/stage/PeriodHoverContext.tsx).
// Subscribers are notified only when the period KEY changes — never per
// mousemove pixel.

type PeriodHoverListener = () => void;

export type PeriodHoverStore = {
  getSnapshot: () => string | null;
  /** Set the hovered period key. Notifies subscribers only when the key changes. */
  set: (key: string, ownerId: string) => void;
  /** Clear the hover, but only if `ownerId` still owns it (guards chart-to-chart handoff). */
  clear: (ownerId: string) => void;
  subscribe: (listener: PeriodHoverListener) => () => void;
};

export function createPeriodHoverStore(): PeriodHoverStore {
  let current: string | null = null;
  let owner: string | null = null;
  const listeners = new Set<PeriodHoverListener>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => current,
    set(key, ownerId) {
      owner = ownerId;
      if (current === key) return;
      current = key;
      emit();
    },
    clear(ownerId) {
      if (owner !== ownerId) return;
      owner = null;
      if (current === null) return;
      current = null;
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
