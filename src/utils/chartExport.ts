import type { PieModel } from '../types';

// ── Copy-data (TSV) serialization ────────────────────────────────────────────
// Exports the aggregated series a chart actually renders (never raw rows) as
// tab-separated text with a header row, so it pastes cleanly into Excel/Jira.

/** `[dataKey, header label]` pair describing one exported column. */
export type TsvColumn = readonly [key: string, label: string];

const BASELINE_FIELD_SUFFIX = '__base';

/** One TSV cell: numbers keep value precision but drop float noise; text loses tabs/newlines. */
export function tsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(Math.round(value * 1e6) / 1e6);
  }
  return String(value).replace(/[\t\r\n]+/g, ' ').trim();
}

export function seriesToTsv(
  rows: ReadonlyArray<Record<string, unknown>>,
  columns: ReadonlyArray<TsvColumn>,
  options: { baselineLabel?: string } = {},
): string {
  // When the compare lens merged `${key}__base` ghost fields into the rendered
  // data, export those too as "<label> (production|baseline)" columns.
  const resolved: TsvColumn[] = [...columns];
  if (options.baselineLabel) {
    for (const [key, label] of columns) {
      const baseKey = `${key}${BASELINE_FIELD_SUFFIX}`;
      if (rows.some((row) => row[baseKey] !== undefined)) {
        resolved.push([baseKey, `${label} (${options.baselineLabel})`]);
      }
    }
  }
  const header = resolved.map(([, label]) => tsvCell(label)).join('\t');
  const body = rows.map((row) => resolved.map(([key]) => tsvCell(row[key])).join('\t'));
  return [header, ...body].join('\n');
}

/** Nested donut export: inner ring categories first, then outer detail segments. */
export function pieModelToTsv(model: PieModel): string {
  const rows: Array<Record<string, unknown>> = [
    ...model.inner.map((entry) => ({
      ring: 'category',
      segment: entry.name,
      category: entry.name,
      value: entry.value,
      signedValue: entry.signedValue,
    })),
    ...model.outer.map((entry) => ({
      ring: 'detail',
      segment: entry.name,
      category: entry.category,
      value: entry.value,
      signedValue: entry.signedValue,
    })),
  ];
  return seriesToTsv(rows, [
    ['ring', 'Ring'],
    ['segment', 'Segment'],
    ['category', 'Category'],
    ['value', 'Plotted Value'],
    ['signedValue', 'Signed Value'],
  ]);
}

export async function copyTsv(tsv: string): Promise<'copied'> {
  const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  if (!clipboard?.writeText) throw new Error('Clipboard text copy is not available in this browser.');
  await clipboard.writeText(tsv);
  return 'copied';
}

// ── Copy-chart-as-PNG ─────────────────────────────────────────────────────────
// Hand-rolled SVG → PNG: serialize the rendered Recharts SVG, rasterize it via
// an Image onto a canvas (with the card title and an opaque background so the
// paste is legible), then hand the blob to the async clipboard. CSS classes and
// variables do not survive XMLSerializer, so every node's rendered presentation
// is resolved with getComputedStyle and inlined on the clone first.

const PNG_SCALE = 2;
// The export composites three stacked bands — [title] over [chart] over
// [legend] — with uniform side padding so the paste has breathing room.
const PNG_PAD_X = 16;
const PNG_TITLE_BAND = 38;
const PNG_TITLE_PAD_X = 16;
const PNG_TITLE_FONT = '600 14px "Segoe UI", system-ui, sans-serif';
const PNG_TITLE_COLOR = '#1A1814';
const PNG_LEGEND_FONT = '500 12px "Segoe UI", system-ui, sans-serif';
const PNG_LEGEND_COLOR = '#46413A';
const PNG_LEGEND_TOP_PAD = 8;
const PNG_LEGEND_BOTTOM_PAD = 14;
const PNG_LEGEND_ROW_H = 20;
const PNG_LEGEND_SWATCH = 11;
const PNG_LEGEND_LABEL_GAP = 7;
const PNG_LEGEND_ITEM_GAP = 18;

export type ChartLegendEntry = { label: string; color: string };

const INLINE_STYLE_PROPS = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-opacity',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'letter-spacing',
  'text-anchor',
  'dominant-baseline',
  'visibility',
] as const;

function inlineComputedStyles(source: SVGSVGElement, clone: SVGSVGElement): void {
  // Both trees come from the same cloneNode(true), so document order matches.
  const sourceNodes: Element[] = [source, ...Array.from(source.querySelectorAll('*'))];
  const cloneNodes: Element[] = [clone, ...Array.from(clone.querySelectorAll('*'))];
  for (let index = 0; index < sourceNodes.length && index < cloneNodes.length; index += 1) {
    const target = cloneNodes[index];
    if (!(target instanceof SVGElement)) continue;
    const computed = window.getComputedStyle(sourceNodes[index]);
    for (const property of INLINE_STYLE_PROPS) {
      const value = computed.getPropertyValue(property);
      if (value) target.style.setProperty(property, value);
    }
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not rasterize the chart SVG.'));
    image.src = url;
  });
}

export function pngFileName(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${slug || 'chart'}.png`;
}

/**
 * The actual plotted chart within a card — never a Recharts legend swatch (each
 * legend item is itself a 14×14 `<svg class="recharts-surface">`, and those sort
 * BEFORE the chart in document order) nor a data-table icon. The plotted surface
 * dwarfs every stray icon, so the largest box wins. In jsdom every box measures
 * 0×0, so the first non-legend `<svg>` is returned (the unit tests rely on this).
 */
export function findChartSurface(root: ParentNode): SVGSVGElement | null {
  const svgs = Array.from(root.querySelectorAll<SVGSVGElement>('svg')).filter(
    (node) => !node.closest('.recharts-legend-wrapper'),
  );
  if (!svgs.length) return null;
  let best = svgs[0];
  let bestArea = -1;
  for (const node of svgs) {
    const box = node.getBoundingClientRect();
    const area = box.width * box.height;
    if (area > bestArea) {
      bestArea = area;
      best = node;
    }
  }
  return best;
}

/**
 * Recharts draws the legend as HTML beside the SVG, so it never survives
 * serialization. Read each item's label and marker colour back from the DOM here
 * so the export can repaint a matching legend onto the canvas.
 */
export function collectChartLegend(root: ParentNode): ChartLegendEntry[] {
  const entries: ChartLegendEntry[] = [];
  for (const item of Array.from(root.querySelectorAll('.recharts-legend-item'))) {
    const label = (item.querySelector('.recharts-legend-item-text')?.textContent ?? item.textContent ?? '').trim();
    if (!label) continue;
    const shape = item.querySelector('path, rect, line, circle, polyline');
    const fill = shape?.getAttribute('fill');
    const stroke = shape?.getAttribute('stroke');
    const color = fill && fill !== 'none' ? fill : stroke && stroke !== 'none' ? stroke : PNG_LEGEND_COLOR;
    entries.push({ label, color });
  }
  return entries;
}

type LegendRowItem = { entry: ChartLegendEntry; width: number };

/** Pack legend entries into centered rows that wrap within `maxWidth`. */
function layoutLegendRows(
  context: CanvasRenderingContext2D,
  entries: ReadonlyArray<ChartLegendEntry>,
  maxWidth: number,
): LegendRowItem[][] {
  const rows: LegendRowItem[][] = [];
  let row: LegendRowItem[] = [];
  let used = 0;
  for (const entry of entries) {
    const itemWidth = PNG_LEGEND_SWATCH + PNG_LEGEND_LABEL_GAP + context.measureText(entry.label).width;
    const advance = itemWidth + (row.length ? PNG_LEGEND_ITEM_GAP : 0);
    if (row.length && used + advance > maxWidth) {
      rows.push(row);
      row = [];
      used = 0;
    }
    used += itemWidth + (row.length ? PNG_LEGEND_ITEM_GAP : 0);
    row.push({ entry, width: itemWidth });
  }
  if (row.length) rows.push(row);
  return rows;
}

function roundedRectPath(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + w, y, x + w, y + h, radius);
  context.arcTo(x + w, y + h, x, y + h, radius);
  context.arcTo(x, y + h, x, y, radius);
  context.arcTo(x, y, x + w, y, radius);
  context.closePath();
}

function drawLegend(context: CanvasRenderingContext2D, rows: LegendRowItem[][], totalWidth: number, top: number): void {
  if (!rows.length) return;
  context.font = PNG_LEGEND_FONT;
  context.textBaseline = 'middle';
  context.textAlign = 'left';
  let y = top;
  for (const row of rows) {
    const rowWidth = row.reduce((sum, item, index) => sum + item.width + (index ? PNG_LEGEND_ITEM_GAP : 0), 0);
    let x = Math.max(PNG_PAD_X, (totalWidth - rowWidth) / 2);
    const centerY = y + PNG_LEGEND_ROW_H / 2;
    for (const item of row) {
      context.fillStyle = item.entry.color;
      roundedRectPath(context, x, centerY - PNG_LEGEND_SWATCH / 2, PNG_LEGEND_SWATCH, PNG_LEGEND_SWATCH, 2);
      context.fill();
      context.fillStyle = PNG_LEGEND_COLOR;
      context.fillText(item.entry.label, x + PNG_LEGEND_SWATCH + PNG_LEGEND_LABEL_GAP, centerY + 0.5);
      x += item.width + PNG_LEGEND_ITEM_GAP;
    }
    y += PNG_LEGEND_ROW_H;
  }
}

export async function chartSvgToPngBlob(
  svg: SVGSVGElement,
  options: { title?: string; legend?: ReadonlyArray<ChartLegendEntry>; background?: string; scale?: number } = {},
): Promise<Blob> {
  const { title, legend = [], background = '#ffffff', scale = PNG_SCALE } = options;
  const rect = svg.getBoundingClientRect();
  const chartWidth = Math.max(1, Math.round(rect.width || Number(svg.getAttribute('width')) || 600));
  const chartHeight = Math.max(1, Math.round(rect.height || Number(svg.getAttribute('height')) || 300));

  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineComputedStyles(svg, clone);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(chartWidth));
  clone.setAttribute('height', String(chartHeight));
  if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${chartWidth} ${chartHeight}`);

  const markup = new XMLSerializer().serializeToString(clone);
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`);

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is not available.');

  const totalWidth = chartWidth + PNG_PAD_X * 2;
  const titleBand = title ? PNG_TITLE_BAND : 0;

  // Lay the legend out (and so size its band) before committing canvas dimensions.
  context.font = PNG_LEGEND_FONT;
  const legendRows = layoutLegendRows(context, legend, totalWidth - PNG_PAD_X * 2);
  const legendBand = legendRows.length
    ? legendRows.length * PNG_LEGEND_ROW_H + PNG_LEGEND_TOP_PAD + PNG_LEGEND_BOTTOM_PAD
    : 0;
  const totalHeight = titleBand + chartHeight + legendBand;

  // Setting the canvas size resets the 2D context, so size first, then paint.
  canvas.width = Math.round(totalWidth * scale);
  canvas.height = Math.round(totalHeight * scale);
  context.scale(scale, scale);

  context.fillStyle = background;
  context.fillRect(0, 0, totalWidth, totalHeight);

  if (title) {
    context.fillStyle = PNG_TITLE_COLOR;
    context.font = PNG_TITLE_FONT;
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText(title, PNG_TITLE_PAD_X, titleBand / 2 + 1, totalWidth - PNG_TITLE_PAD_X * 2);
  }

  context.drawImage(image, PNG_PAD_X, titleBand, chartWidth, chartHeight);
  drawLegend(context, legendRows, totalWidth, titleBand + chartHeight + PNG_LEGEND_TOP_PAD);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed.'))), 'image/png');
  });
}

export type PngCopyResult = 'copied' | 'downloaded';

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/**
 * Copies the chart PNG to the clipboard; if ClipboardItem is unavailable (or
 * the write is rejected), falls back to downloading the PNG instead.
 */
export async function copyChartPng(
  svg: SVGSVGElement,
  options: { title: string; legend?: ReadonlyArray<ChartLegendEntry> },
): Promise<PngCopyResult> {
  const blob = await chartSvgToPngBlob(svg, { title: options.title, legend: options.legend });
  const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  if (clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      await clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return 'copied';
    } catch {
      // Permission/focus refusals fall through to the download path.
    }
  }
  downloadBlob(blob, pngFileName(options.title));
  return 'downloaded';
}
