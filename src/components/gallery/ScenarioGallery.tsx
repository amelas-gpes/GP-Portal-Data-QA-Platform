import { Check, Copy, Download, Maximize2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BIRow, FormulaRegistry, LogicVersion, ScenarioVisualId } from '../../types';
import { copyChartPng, collectChartLegend, findChartSurface } from '../../utils/chartExport';
import { exportGalleryZip } from '../../utils/galleryExport';
import { buildGallery, type GalleryScenario } from '../../utils/scenarioGallery';
import { SCENARIO_VISUALS } from '../../utils/scenarioClassifier';
import { EmptyState } from '../common';
import { ScenarioLabel } from '../stage/ScenarioLabel';
import { GalleryVisualChart } from './GalleryVisualChart';

export type ScenarioGalleryProps = {
  /** The selected investor's rows — every card is this investor, in a different scenario. */
  baseRows: BIRow[];
  baseName: string;
  baseShortCode?: string | null;
  formulas: FormulaRegistry;
  logicVersion: LogicVersion;
  cumulative: boolean;
  initialVisual?: ScenarioVisualId;
};

/**
 * For the selected investor, every distinct way a visual can render: the one
 * scenario it actually sits in (its real data) and every other scenario it
 * could be in, synthesized by forcing its source-column polarity. On-demand QA
 * surface: switch visual, expand a case, copy a chart, or export the set as a zip.
 */
export function ScenarioGallery({
  baseRows, baseName, baseShortCode, formulas, logicVersion, cumulative, initialVisual,
}: ScenarioGalleryProps) {
  const [visualId, setVisualId] = useState<ScenarioVisualId>(initialVisual ?? 'commitment');
  const [expanded, setExpanded] = useState<GalleryScenario | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const summary = useMemo(
    () => (baseRows.length ? buildGallery(visualId, baseRows, formulas, logicVersion, cumulative) : null),
    [visualId, baseRows, formulas, logicVersion, cumulative],
  );

  // Escape closes the lightbox before it bubbles to the app's global handler.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); setExpanded(null); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [expanded]);

  const copyCard = useCallback(async (scenario: GalleryScenario, scope: Element | null) => {
    const svg = scope ? findChartSurface(scope) : null;
    if (!svg || !scope || !summary) return;
    try {
      await copyChartPng(svg, { title: `${summary.title} — ${scenario.label}`, legend: collectChartLegend(scope) });
      setCopiedId(scenario.id);
      window.setTimeout(() => setCopiedId((current) => (current === scenario.id ? null : current)), 1400);
    } catch {
      // Clipboard refusal falls back to a download inside copyChartPng; nothing to surface.
    }
  }, [summary]);

  const handleExport = useCallback(async () => {
    if (!gridRef.current || !summary) return;
    setExporting(true);
    try { await exportGalleryZip(gridRef.current, summary); } finally { setExporting(false); }
  }, [summary]);

  if (!summary) {
    return (
      <div className="scn-gallery scn-gallery--empty">
        <EmptyState
          title="Pick an investor to base the gallery on"
          detail="The Scenario Gallery shows one investor in every scenario. Select a single investor in the Investors panel, then return here."
        />
      </div>
    );
  }

  const syntheticCount = summary.scenarios.filter((scenario) => !scenario.actual).length;

  return (
    <section className="scn-gallery" aria-label="Scenario gallery">
      <header className="scn-gallery__head">
        <div className="scn-gallery__heading">
          <h2 className="scn-gallery__title">Scenario Gallery</h2>
          <span className="scn-gallery__sub">
            How <b>{baseName}</b>{baseShortCode ? <> <span className="scn-gallery__code">{baseShortCode}</span></> : null} would render in every scenario — its actual one, plus synthetic what-ifs.
          </span>
        </div>

        <div className="scn-gallery__visuals" role="tablist" aria-label="Visual">
          {SCENARIO_VISUALS.map((visual) => (
            <button
              key={visual.id}
              type="button"
              role="tab"
              aria-selected={visual.id === visualId}
              data-active={visual.id === visualId ? 'true' : undefined}
              onClick={() => setVisualId(visual.id)}
            >
              {visual.title}
            </button>
          ))}
        </div>

        <div className="scn-gallery__toolbar">
          <p className="scn-gallery__count">
            This investor's actual scenario · <b>{syntheticCount}</b> synthetic what-if{syntheticCount === 1 ? '' : 's'}
            {logicVersion === 'draft' ? <span className="scn-gallery__draft" title="Charts reflect the draft formula logic.">Draft logic</span> : null}
          </p>
          <button type="button" className="scn-gallery__export" onClick={handleExport} disabled={exporting}>
            <Download size={14} aria-hidden="true" />
            {exporting ? 'Exporting…' : 'Export gallery'}
          </button>
        </div>
      </header>

      <div className="scn-gallery__grid" ref={gridRef}>
        {summary.scenarios.map((scenario) => (
          <article
            key={scenario.id}
            className="scn-gallery__card"
            data-scn-id={scenario.id}
            data-actual={scenario.actual ? 'true' : undefined}
          >
            <div className="scn-gallery__card-head">
              <ScenarioLabel label={scenario.label} className="scn-gallery__card-label" />
              <span className="scn-gallery__tag" data-tone={scenario.actual ? 'actual' : 'synthetic'}>
                {scenario.actual ? 'Actual' : 'Synthetic'}
              </span>
            </div>

            <div className="scn-gallery__chart">
              <GalleryVisualChart chartId={summary.chartId} data={scenario.quarterSeries} />
            </div>

            <div className="scn-gallery__card-foot">
              <span className={scenario.actual ? 'scn-gallery__meta' : 'scn-gallery__meta scn-gallery__meta--muted'}>
                {scenario.actual ? 'This investor’s real data' : 'How they would look here'}
              </span>
              <div className="scn-gallery__actions">
                <button
                  type="button"
                  title="Copy chart as PNG"
                  aria-label="Copy chart as PNG"
                  onClick={(event) => void copyCard(scenario, event.currentTarget.closest('.scn-gallery__card'))}
                >
                  {copiedId === scenario.id ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                </button>
                <button type="button" title="Expand" aria-label="Expand scenario" onClick={() => setExpanded(scenario)}>
                  <Maximize2 size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {expanded ? (
        <div
          className="scn-gallery__lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${summary.title} — ${expanded.label}`}
          onMouseDown={(event) => { if (event.target === event.currentTarget) setExpanded(null); }}
        >
          <div className="scn-gallery__lightbox-panel">
            <div className="scn-gallery__lightbox-head">
              <ScenarioLabel label={expanded.label} className="scn-gallery__lightbox-label" />
              <span className="scn-gallery__tag" data-tone={expanded.actual ? 'actual' : 'synthetic'}>
                {expanded.actual ? 'Actual' : 'Synthetic'}
              </span>
              <button type="button" className="scn-gallery__lightbox-close" title="Close" aria-label="Close" onClick={() => setExpanded(null)}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="scn-gallery__lightbox-chart">
              <GalleryVisualChart chartId={summary.chartId} data={expanded.quarterSeries} height={440} large />
            </div>
            <div className="scn-gallery__lightbox-foot">
              <span className="scn-gallery__sub">
                {summary.title} · {baseName}{expanded.actual ? ' (their real scenario)' : ' (synthetic what-if)'}
              </span>
              <button
                type="button"
                className="scn-gallery__export"
                onClick={(event) => void copyCard(expanded, event.currentTarget.closest('.scn-gallery__lightbox-panel')?.querySelector('.scn-gallery__lightbox-chart') ?? null)}
              >
                <Copy size={14} aria-hidden="true" /> Copy PNG
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
