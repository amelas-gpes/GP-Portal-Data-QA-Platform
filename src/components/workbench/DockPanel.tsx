import { Database, FlaskConical, LayoutGrid, PanelBottom, PanelLeft, PanelRight, Sigma, Users, X } from 'lucide-react';
import { useCallback, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  DOCK_BOUNDS,
  DOCK_VIEW_LABEL,
  type DockEdge,
  type DockLayout,
  type DockPanelState,
  type DockViewId,
} from '../../state/dockLayout';
import { IconButton } from '../common';

const VIEW_ICON: Record<DockViewId, ReactNode> = {
  investors: <Users size={14} aria-hidden="true" />,
  scenarios: <LayoutGrid size={14} aria-hidden="true" />,
  data: <Database size={14} aria-hidden="true" />,
  whatif: <FlaskConical size={14} aria-hidden="true" />,
  logic: <Sigma size={14} aria-hidden="true" />,
};

const EDGE_ICON: Record<DockEdge, ReactNode> = {
  left: <PanelLeft size={15} aria-hidden="true" />,
  bottom: <PanelBottom size={15} aria-hidden="true" />,
  right: <PanelRight size={15} aria-hidden="true" />,
};

// Top-bar toggle order mirrors the panels' positions on screen.
const TOGGLE_ORDER: ReadonlyArray<{ edge: DockEdge; label: string; hint: string }> = [
  { edge: 'left', label: 'navigator', hint: 'Ctrl+B' },
  { edge: 'bottom', label: 'bottom panel', hint: 'Ctrl+J' },
  { edge: 'right', label: 'right panel', hint: 'Ctrl+Alt+B' },
];

export type DockPanelProps = {
  edge: DockEdge;
  state: DockPanelState;
  /** Selectable views (right/bottom). Omit for a single-purpose panel (the navigator). */
  views?: readonly DockViewId[];
  /** Fixed title shown when there is nothing to choose between. */
  title?: string;
  /** Mark a tab with a status dot (e.g. What-if is armed). */
  dotView?: DockViewId | null;
  onSelectView: (view: DockViewId) => void;
  onClose: () => void;
  onResize: (size: number) => void;
  children: ReactNode;
};

/**
 * One docked panel. Owns its header (content tabs + close), the resize splitter
 * on its inner edge, and a scrolling body. It is presentational — open/closed
 * lives in the dock layout, and the body content is handed in by the shell.
 */
export function DockPanel({ edge, state, views, title, dotView, onSelectView, onClose, onResize, children }: DockPanelProps) {
  const heading = title ?? DOCK_VIEW_LABEL[state.view];
  const choosable = views && views.length > 1;

  return (
    <section className="dock-panel" data-edge={edge} aria-label={heading}>
      <DockResizer edge={edge} size={state.size} onResize={onResize} />
      <header className="dock-panel__head">
        {choosable ? (
          <div className="dock-panel__tabs" role="tablist" aria-label="Panel content">
            {views.map((view) => (
              <button
                key={view}
                type="button"
                role="tab"
                className="dock-tab"
                aria-selected={state.view === view}
                data-active={state.view === view ? 'true' : undefined}
                title={`Show ${DOCK_VIEW_LABEL[view]} here`}
                onClick={() => onSelectView(view)}
              >
                <span className="dock-tab__icon">{VIEW_ICON[view]}</span>
                {DOCK_VIEW_LABEL[view]}
                {dotView === view ? <span className="dock-tab__dot" aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        ) : (
          <span className="dock-panel__title">
            <span className="dock-panel__title-icon">{VIEW_ICON[state.view]}</span>
            {heading}
          </span>
        )}
        <IconButton className="dock-panel__close" label={`Close ${heading} panel`} variant="text" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </header>
      <div className="dock-panel__body" data-view={state.view}>
        {children}
      </div>
    </section>
  );
}

/** A thin grab-handle on a panel's inner edge. Drag widens/heightens the panel. */
function DockResizer({ edge, size, onResize }: { edge: DockEdge; size: number; onResize: (size: number) => void }) {
  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const vertical = edge === 'bottom';
      const origin = vertical ? event.clientY : event.clientX;
      const base = size;
      // The left panel grows as the handle moves right; right/bottom grow inward.
      const grow = edge === 'left' ? 1 : -1;
      const bounds = DOCK_BOUNDS[edge];

      const onMove = (move: PointerEvent) => {
        const pos = vertical ? move.clientY : move.clientX;
        const next = Math.min(bounds.max, Math.max(bounds.min, base + (pos - origin) * grow));
        onResize(next);
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.classList.remove('is-dock-resizing');
        document.body.style.removeProperty('cursor');
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      // Freeze panel transitions + text selection for a crisp drag.
      document.body.classList.add('is-dock-resizing');
      document.body.style.cursor = vertical ? 'row-resize' : 'col-resize';
    },
    [edge, size, onResize],
  );

  return (
    <div
      className="dock-resizer"
      data-edge={edge}
      role="separator"
      aria-orientation={edge === 'bottom' ? 'horizontal' : 'vertical'}
      onPointerDown={onPointerDown}
    />
  );
}

/** The three panel toggles that live in the top bar — open or close any side. */
export function WorkbenchToggles({ layout, onToggle }: { layout: DockLayout; onToggle: (edge: DockEdge) => void }) {
  return (
    <div className="workbench-toggles" role="group" aria-label="Panels">
      {TOGGLE_ORDER.map(({ edge, label, hint }) => {
        const open = layout[edge].open;
        return (
          <button
            key={edge}
            type="button"
            className="workbench-toggle"
            data-active={open ? 'true' : undefined}
            aria-pressed={open}
            aria-label={`${open ? 'Hide' : 'Show'} ${label}`}
            title={`${open ? 'Hide' : 'Show'} ${label} (${hint})`}
            onClick={() => onToggle(edge)}
          >
            {EDGE_ICON[edge]}
          </button>
        );
      })}
    </div>
  );
}
