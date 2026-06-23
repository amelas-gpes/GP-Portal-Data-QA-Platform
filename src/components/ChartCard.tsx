import { Check, Image as ImageIcon, Info, Maximize2, Minimize2, Table2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { collectChartLegend, copyChartPng, copyTsv, findChartSurface, type PngCopyResult } from '../utils/chartExport';
import { SeverityPill } from './common';
import { tierNoun } from './severityText';

// ── Expanded-card split (chart over data table) ──────────────────────────────
// When a card is expanded and given a `detail` panel, the body becomes a
// vertical split: chart on top, draggable handle, data table below. The chart
// region's height is a fraction of the body so it stays robust across viewport
// resizes; the detail region flexes to fill the rest.
const MIN_CHART_FRACTION = 0.25;
const MAX_CHART_FRACTION = 0.82;
const DEFAULT_CHART_FRACTION = 0.46;
const KEYBOARD_FRACTION_STEP = 0.04;

function clampChartFraction(value: number): number {
  return Math.min(MAX_CHART_FRACTION, Math.max(MIN_CHART_FRACTION, value));
}

type ChartCardBadgeTone = 'neutral' | 'good' | 'warn' | 'bad';

export type ChartCardBadge = {
  label: string;
  tone?: ChartCardBadgeTone;
  title?: string;
};

export type ChartCardSeverity = {
  critical: number;
  warning: number;
  onClick?: (chartId: string, tier: 'critical' | 'warning', event: MouseEvent<HTMLButtonElement>) => void;
};

export type ChartMetricChip = {
  id: string;
  name: string;
  dirty?: boolean;
};

// ── Copy affordance ──────────────────────────────────────────────────────────
// Quiet icon buttons revealed on card hover: copy the rendered chart as a PNG
// (clipboard, or a download when ClipboardItem is unavailable) and copy the
// aggregated series as TSV. Confirmation is an inline state change — no toast.

type CopyFeedback = 'idle' | 'busy' | 'copied' | 'saved' | 'error';

const COPY_FEEDBACK_RESET_MS = 1600;

function copyFeedbackTitle(feedback: CopyFeedback, label: string): string {
  if (feedback === 'copied') return 'Copied';
  if (feedback === 'saved') return 'Clipboard unavailable — saved as a PNG download';
  if (feedback === 'error') return 'Copy failed';
  return label;
}

function CopyActionButton({ label, icon, onCopy }: { label: string; icon: ReactNode; onCopy: () => Promise<PngCopyResult> }) {
  const [feedback, setFeedback] = useState<CopyFeedback>('idle');
  const timerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const settle = (next: CopyFeedback) => {
    setFeedback(next);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setFeedback('idle'), COPY_FEEDBACK_RESET_MS);
  };

  const handleClick = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (feedback === 'busy') return;
    setFeedback('busy');
    try {
      settle((await onCopy()) === 'downloaded' ? 'saved' : 'copied');
    } catch {
      settle('error');
    }
  };

  const title = copyFeedbackTitle(feedback, label);
  return (
    <button
      className="chart-card__copy-btn"
      type="button"
      onClick={handleClick}
      data-state={feedback}
      disabled={feedback === 'busy'}
      aria-label={title}
      title={title}
    >
      {feedback === 'copied' || feedback === 'saved' ? <Check size={13} /> : icon}
      {feedback === 'copied' ? <span className="chart-card__copy-flash">Copied</span> : null}
      {feedback === 'saved' ? <span className="chart-card__copy-flash">Saved</span> : null}
    </button>
  );
}

export function ChartCard({
  id,
  title,
  help,
  badges = [],
  severity,
  metricChips = [],
  onMetricClick,
  selected = false,
  expanded = false,
  empty = false,
  concealed = false,
  dimmed = false,
  onSelect,
  onExpandedChange,
  exportTsv,
  children,
  footer,
  detail,
  wide = false,
}: {
  id: string;
  title: string;
  help: string;
  badges?: ChartCardBadge[];
  severity?: ChartCardSeverity | null;
  metricChips?: ChartMetricChip[];
  onMetricClick?: (metricId: string) => void;
  selected?: boolean;
  expanded?: boolean;
  empty?: boolean;
  concealed?: boolean;
  /** Changed-lens dimming: this chart has no production-vs-draft delta. */
  dimmed?: boolean;
  onSelect?: () => void;
  onExpandedChange?: (chartId: string | null) => void;
  /** Lazy TSV builder for the chart's aggregated series; omitting it hides the copy-data button. */
  exportTsv?: () => string;
  children: ReactNode;
  footer?: ReactNode;
  /** Panel rendered below the chart when expanded, split off by a drag handle. */
  detail?: ReactNode;
  wide?: boolean;
}) {
  const rootRef = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const splitActive = expanded && Boolean(detail);
  const [chartFraction, setChartFraction] = useState(DEFAULT_CHART_FRACTION);
  const [dragging, setDragging] = useState(false);
  const dragStateRef = useRef<{ pointerId: number; startY: number; startFraction: number; bodyHeight: number } | null>(null);

  const onSplitterPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const body = bodyRef.current;
    const bodyHeight = body?.getBoundingClientRect().height ?? 0;
    if (bodyHeight <= 0) return;
    dragStateRef.current = { pointerId: event.pointerId, startY: event.clientY, startFraction: chartFraction, bodyHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    event.preventDefault();
  }, [chartFraction]);

  const onSplitterPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaFraction = (event.clientY - drag.startY) / drag.bodyHeight;
    setChartFraction(clampChartFraction(drag.startFraction + deltaFraction));
  }, []);

  const onSplitterPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  }, []);

  const onSplitterKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const direction = event.key === 'ArrowUp' ? -1 : 1;
    setChartFraction((current) => clampChartFraction(current + direction * KEYBOARD_FRACTION_STEP));
  }, []);

  // On expand, lift the focused card up to just below the sticky top bar so the
  // non-sticky chrome above (KPI band, findings) scrolls off and BOTH the chart
  // and its data table land in view — otherwise the tall card pushes the table
  // below the fold and it reads as "no table".
  useEffect(() => {
    if (!splitActive) return;
    const card = rootRef.current;
    if (!card) return;
    const header = document.querySelector<HTMLElement>('.top-bar');
    const headerHeight = header?.offsetHeight ?? 0;
    const target = window.scrollY + card.getBoundingClientRect().top - headerHeight - 8;
    window.scrollTo({ top: Math.max(0, target) });
  }, [splitActive]);
  const expandLabel = expanded ? `Minimize ${title}` : `Focus ${title}`;
  const cardClassName = [
    'chart-card',
    wide ? 'chart-card-wide' : '',
    selected ? 'chart-card-selected' : '',
    expanded ? 'chart-card-expanded' : '',
    empty ? 'chart-card-empty' : '',
    concealed ? 'chart-card-concealed' : '',
    dimmed ? 'chart-card-dimmed' : '',
    onSelect ? 'chart-card-selectable' : '',
  ].filter(Boolean).join(' ');

  const toggleExpanded = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onSelect?.();
    onExpandedChange?.(expanded ? null : id);
  };

  const copyPng = () => {
    // Prefer the chart region so the inline data table's icon SVGs are never
    // mistaken for the chart when the card is split. Within that scope,
    // findChartSurface skips legend-swatch SVGs and picks the plotted surface.
    const scope = rootRef.current?.querySelector<HTMLElement>('.chart-card__chart-region')
      ?? rootRef.current?.querySelector<HTMLElement>('.chart-card__body')
      ?? rootRef.current;
    const svg = scope ? findChartSurface(scope) : null;
    if (!svg || !scope) return Promise.reject(new Error('No rendered chart to copy.'));
    return copyChartPng(svg, { title, legend: collectChartLegend(scope) });
  };

  const copyData = exportTsv
    ? async (): Promise<PngCopyResult> => copyTsv(exportTsv())
    : null;

  return (
    <section
      ref={rootRef}
      className={cardClassName}
      data-chart-id={id}
      onClick={onSelect}
      aria-hidden={concealed ? 'true' : undefined}
      aria-current={selected ? 'true' : undefined}
    >
      <header className="chart-card__header">
        <span className="chart-card__title">{title}</span>
        <div className="chart-card__signals">
          {dimmed ? <span className="chart-card__nochange">no change</span> : null}
          {badges.map((badge) => (
            <span key={`${badge.label}-${badge.tone ?? 'neutral'}`} className="chart-card__badge" data-tone={badge.tone ?? 'neutral'} title={badge.title ?? badge.label}>
              {badge.label}
            </span>
          ))}
          {severity && severity.critical > 0 ? (
            <SeverityPill tier="critical" count={severity.critical} title={`${severity.critical} ${tierNoun('critical', severity.critical)} on this chart for the current selection — click for details`} onClick={severity.onClick ? (event) => severity.onClick?.(id, 'critical', event) : undefined} />
          ) : null}
          {severity && severity.warning > 0 ? (
            <SeverityPill tier="warning" count={severity.warning} title={`${severity.warning} ${tierNoun('warning', severity.warning)} on this chart for the current selection — click for details`} onClick={severity.onClick ? (event) => severity.onClick?.(id, 'warning', event) : undefined} />
          ) : null}
          {!empty || copyData ? (
            <span className="chart-card__copy" role="group" aria-label={`Copy ${title}`}>
              {copyData ? (
                <CopyActionButton label={`Copy ${title} data as TSV`} icon={<Table2 size={13} />} onCopy={copyData} />
              ) : null}
              {!empty ? (
                <CopyActionButton label={`Copy ${title} as PNG`} icon={<ImageIcon size={13} />} onCopy={copyPng} />
              ) : null}
            </span>
          ) : null}
          <span className="chart-card__info" title={help} aria-label={`About ${title}: ${help}`} role="img">
            <Info size={13} />
          </span>
          {onExpandedChange ? (
            <button className="chart-card__expand" type="button" onClick={toggleExpanded} aria-label={expandLabel} aria-pressed={expanded} title={expandLabel}>
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          ) : null}
        </div>
      </header>
      {metricChips.length && onMetricClick ? (
        <div className="chart-card__metrics" aria-label={`${title} metrics — click to edit logic`}>
          {metricChips.map((chip) => (
            <button
              key={chip.id}
              className="chart-card__metric-chip"
              data-dirty={chip.dirty ? 'true' : undefined}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onMetricClick(chip.id);
              }}
              title={`Edit the ${chip.name} formula`}
            >
              {chip.name}
              {chip.dirty ? <i className="chart-card__dirty-dot" aria-label="draft differs from production" /> : null}
            </button>
          ))}
        </div>
      ) : null}
      {splitActive ? (
        <div
          ref={bodyRef}
          className="chart-card__body chart-card__body--split"
          data-dragging={dragging ? 'true' : undefined}
        >
          <div className="chart-card__chart-region" style={{ height: `${chartFraction * 100}%` }}>{children}</div>
          <div
            className="chart-card__splitter"
            role="separator"
            aria-orientation="horizontal"
            aria-label={`Resize the ${title} chart and its data table`}
            aria-valuenow={Math.round(chartFraction * 100)}
            aria-valuemin={Math.round(MIN_CHART_FRACTION * 100)}
            aria-valuemax={Math.round(MAX_CHART_FRACTION * 100)}
            tabIndex={0}
            title="Drag (or use ↑/↓) to resize the chart and the data table"
            onPointerDown={onSplitterPointerDown}
            onPointerMove={onSplitterPointerMove}
            onPointerUp={onSplitterPointerUp}
            onPointerCancel={onSplitterPointerUp}
            onKeyDown={onSplitterKeyDown}
          >
            <span className="chart-card__splitter-grip" aria-hidden="true" />
          </div>
          <div className="chart-card__detail-region">{detail}</div>
        </div>
      ) : (
        <div className="chart-card__body">{children}</div>
      )}
      {footer ? <footer className="chart-card__footer">{footer}</footer> : null}
    </section>
  );
}
