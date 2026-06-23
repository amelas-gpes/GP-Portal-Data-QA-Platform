import type { ChartBundle } from '../../types';
import { RawData } from '../RawData';

/**
 * The raw rows behind an expanded chart, rendered inline below the visual.
 *
 * Every chart in a bundle is driven by the same `bundle.rawRows` (the selected
 * investor set) — the data model has no per-chart-point → row mapping — so this
 * shows that whole driving set, labelled by the chart's title rather than
 * pretending to filter to a subset that does not exist. `rawRows` is fetched
 * lazily (App's needRawRows gate), so guard the brief window where the bundle
 * is present but its rows are still in flight.
 */
export function ExpandedChartTable({
  bundle,
  chartId,
  title,
}: {
  bundle: ChartBundle | null;
  chartId: string;
  title: string;
}) {
  if (!bundle) {
    return (
      <div className="expanded-table expanded-table--message" data-chart-id={chartId}>
        Import data and select an investor to inspect the rows behind this visual.
      </div>
    );
  }
  const awaitingRows = bundle.rowCount > 0 && bundle.rawRows.length === 0;
  if (awaitingRows) {
    return (
      <div className="expanded-table expanded-table--message" data-chart-id={chartId} aria-busy="true">
        Loading the rows behind {title}…
      </div>
    );
  }
  return (
    <div className="expanded-table" data-chart-id={chartId}>
      <RawData bundle={bundle} inline scopeTitle={title} />
    </div>
  );
}
