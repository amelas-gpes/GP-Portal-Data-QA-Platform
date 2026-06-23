import { useCallback, useEffect, useReducer } from 'react';

// ── Workbench docks ───────────────────────────────────────────────────────
// A VS Code-style shell: a fixed center stage with three collapsible edges.
// Each edge is a panel the user opens/closes, resizes, and (for the right and
// bottom edges) fills with the view of their choice. State persists to
// localStorage so the workspace is the same next visit.

export type DockEdge = 'left' | 'right' | 'bottom';

/** Everything that can live inside a panel. `investors` is the left navigator. */
export type DockViewId = 'investors' | 'scenarios' | 'data' | 'whatif' | 'logic';

export type DockPanelState = { open: boolean; size: number; view: DockViewId };
export type DockLayout = Record<DockEdge, DockPanelState>;

export const DOCK_EDGES: readonly DockEdge[] = ['left', 'right', 'bottom'];

/** Which views each edge is allowed to host. The left edge is the navigator. */
export const EDGE_VIEWS: Record<DockEdge, readonly DockViewId[]> = {
  left: ['investors'],
  right: ['scenarios', 'data', 'whatif', 'logic'],
  bottom: ['data', 'scenarios', 'whatif', 'logic'],
};

export const DOCK_VIEW_LABEL: Record<DockViewId, string> = {
  investors: 'Investors',
  scenarios: 'Scenarios',
  data: 'Data',
  whatif: 'What-if',
  logic: 'Logic',
};

/** Resize clamps (px). Left/right are widths, bottom is a height. */
export const DOCK_BOUNDS: Record<DockEdge, { min: number; max: number }> = {
  left: { min: 208, max: 440 },
  right: { min: 300, max: 680 },
  bottom: { min: 180, max: 600 },
};

const DEFAULT_LAYOUT: DockLayout = {
  left: { open: true, size: 260, view: 'investors' },
  right: { open: false, size: 408, view: 'scenarios' },
  bottom: { open: false, size: 300, view: 'data' },
};

const STORAGE_KEY = 'gp-portal:dock-layout:v1';

type DockAction =
  | { type: 'toggle'; edge: DockEdge }
  | { type: 'set-open'; edge: DockEdge; open: boolean }
  | { type: 'set-view'; edge: DockEdge; view: DockViewId }
  | { type: 'set-size'; edge: DockEdge; size: number }
  | { type: 'open-with'; edge: DockEdge; view: DockViewId };

function clampSize(edge: DockEdge, size: number): number {
  const { min, max } = DOCK_BOUNDS[edge];
  return Math.min(max, Math.max(min, Math.round(size)));
}

function dockReducer(state: DockLayout, action: DockAction): DockLayout {
  switch (action.type) {
    case 'toggle':
      return { ...state, [action.edge]: { ...state[action.edge], open: !state[action.edge].open } };
    case 'set-open':
      return { ...state, [action.edge]: { ...state[action.edge], open: action.open } };
    case 'set-view':
      // Picking a view is also a request to see it.
      return { ...state, [action.edge]: { ...state[action.edge], view: action.view, open: true } };
    case 'set-size':
      return { ...state, [action.edge]: { ...state[action.edge], size: clampSize(action.edge, action.size) } };
    case 'open-with':
      return { ...state, [action.edge]: { ...state[action.edge], view: action.view, open: true } };
    default:
      return state;
  }
}

// Restored layout is reconciled against the defaults so a stale/partial blob
// (or a view an edge no longer allows) can never break the shell.
function loadLayout(): DockLayout {
  if (typeof window === 'undefined') return DEFAULT_LAYOUT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<Record<DockEdge, Partial<DockPanelState>>>;
    const merge = (edge: DockEdge): DockPanelState => {
      const base = DEFAULT_LAYOUT[edge];
      const saved = parsed?.[edge];
      if (!saved) return base;
      const view = saved.view && EDGE_VIEWS[edge].includes(saved.view) ? saved.view : base.view;
      return {
        open: typeof saved.open === 'boolean' ? saved.open : base.open,
        size: typeof saved.size === 'number' ? clampSize(edge, saved.size) : base.size,
        view,
      };
    };
    return { left: merge('left'), right: merge('right'), bottom: merge('bottom') };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export type DockController = {
  layout: DockLayout;
  toggle: (edge: DockEdge) => void;
  setOpen: (edge: DockEdge, open: boolean) => void;
  setView: (edge: DockEdge, view: DockViewId) => void;
  setSize: (edge: DockEdge, size: number) => void;
  /** Reveal a view at an edge (opening the panel and switching to it). */
  openWith: (edge: DockEdge, view: DockViewId) => void;
};

export function useDockLayout(): DockController {
  const [layout, dispatch] = useReducer(dockReducer, undefined, loadLayout);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // Persistence is a nicety; private-mode quota errors must not crash the app.
    }
  }, [layout]);

  const toggle = useCallback((edge: DockEdge) => dispatch({ type: 'toggle', edge }), []);
  const setOpen = useCallback((edge: DockEdge, open: boolean) => dispatch({ type: 'set-open', edge, open }), []);
  const setView = useCallback((edge: DockEdge, view: DockViewId) => dispatch({ type: 'set-view', edge, view }), []);
  const setSize = useCallback((edge: DockEdge, size: number) => dispatch({ type: 'set-size', edge, size }), []);
  const openWith = useCallback((edge: DockEdge, view: DockViewId) => dispatch({ type: 'open-with', edge, view }), []);

  return { layout, toggle, setOpen, setView, setSize, openWith };
}
