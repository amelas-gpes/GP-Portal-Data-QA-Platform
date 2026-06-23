import { createContext, useContext, useEffect, useId, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ZIndexLayer, useActiveTooltipLabel, usePlotArea, useXAxisDomain, useXAxisScale } from 'recharts';
import { chartColors } from '../../utils/chartTheme';
import { createPeriodHoverStore, type PeriodHoverStore } from '../../utils/periodHoverStore';

// ── Synced period hover ──────────────────────────────────────────────────────
// Hovering a period bucket on one chart highlights the same bucket on every
// visible chart. The hovered period key lives in a tiny external store (see
// src/utils/periodHoverStore.ts), NOT in React state above the charts: a hover
// therefore re-renders only the per-chart highlight layers (via
// useSyncExternalStore), never the charts' full data path — j/k investor
// stepping stays untouched.

const defaultStore = createPeriodHoverStore();
const PeriodHoverContext = createContext<PeriodHoverStore>(defaultStore);

export function PeriodHoverProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createPeriodHoverStore);
  return <PeriodHoverContext.Provider value={store}>{children}</PeriodHoverContext.Provider>;
}

const getServerSnapshot = () => null;

function useHoveredPeriodKey(store: PeriodHoverStore): string | null {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
}

// ── In-chart highlight layer ─────────────────────────────────────────────────
// Rendered as a child of a cartesian period chart (quarter/year buckets on a
// category x-axis keyed by `label`). It both reports this chart's hovered
// bucket to the shared store (useActiveTooltipLabel only changes per bucket,
// never per pixel) and draws a quiet band over the matching bucket when any
// chart owns the hover. Only this tiny component re-renders on hover changes.

const BAND_FILL = chartColors.tan;
const BAND_OPACITY = 0.28;
/** Above the grid (-100), below every series and reference layer (0+). */
const BAND_Z_INDEX = -60;

export function SyncedPeriodHighlight() {
  const store = useContext(PeriodHoverContext);
  const ownerId = useId();
  const activeLabel = useActiveTooltipLabel();

  useEffect(() => {
    if (activeLabel !== null && activeLabel !== undefined) store.set(String(activeLabel), ownerId);
    else store.clear(ownerId);
  }, [activeLabel, store, ownerId]);
  // Unmount (j/k stepping, visibility toggles) must not leave a stale highlight.
  useEffect(() => () => store.clear(ownerId), [store, ownerId]);

  const hovered = useHoveredPeriodKey(store);
  const xScale = useXAxisScale();
  const plotArea = usePlotArea();
  const domain = useXAxisDomain();

  // The layer stays mounted (stable portal registration); only the rect toggles.
  let band: { x: number; width: number } | null = null;
  if (hovered !== null && xScale && plotArea) {
    const bandStart = xScale(hovered, { position: 'start' });
    const bandEnd = xScale(hovered, { position: 'end' });
    const middle = xScale(hovered, { position: 'middle' });
    if (bandStart !== undefined && bandEnd !== undefined && middle !== undefined) {
      let x = bandStart;
      let width = bandEnd - bandStart;
      if (width < 1) {
        // Point scale (line/area charts): synthesize a bucket-wide band around the point.
        const count = Array.isArray(domain) ? domain.length : 0;
        const spacing = count > 1 ? plotArea.width / (count - 1) : plotArea.width;
        const left = Math.max(plotArea.x, middle - spacing / 2);
        const right = Math.min(plotArea.x + plotArea.width, middle + spacing / 2);
        x = left;
        width = right - left;
      }
      if (width > 0) band = { x, width };
    }
  }

  return (
    <ZIndexLayer zIndex={BAND_Z_INDEX}>
      {band && plotArea ? (
        <rect
          className="period-hover-band"
          x={band.x}
          y={plotArea.y}
          width={band.width}
          height={plotArea.height}
          fill={BAND_FILL}
          fillOpacity={BAND_OPACITY}
          stroke="none"
          pointerEvents="none"
        />
      ) : null}
    </ZIndexLayer>
  );
}
