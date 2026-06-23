import { strToU8, zipSync } from 'fflate';
import { chartSvgToPngBlob, collectChartLegend, findChartSurface } from './chartExport';
import { downloadBlob } from './format';
import { scenarioSlug, type GallerySummary } from './scenarioGallery';

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Export the current gallery as a zip: one PNG per scenario card (rasterized
 * from the rendered chart, with the scenario label as the title band) plus an
 * index.csv mapping each file to its scenario, present/synthetic flag, real
 * population, and example investor.
 */
export async function exportGalleryZip(grid: HTMLElement, summary: GallerySummary): Promise<void> {
  const cards = new Map<string, HTMLElement>();
  grid.querySelectorAll<HTMLElement>('.scn-gallery__card').forEach((el) => {
    if (el.dataset.scnId) cards.set(el.dataset.scnId, el);
  });

  const files: Record<string, Uint8Array> = {};
  const csv: string[] = ['Scenario,Pattern,Type,File'];

  let index = 0;
  for (const scenario of summary.scenarios) {
    index += 1;
    const num = String(index).padStart(2, '0');
    const fileName = `${num}-${scenarioSlug(summary.visualId, scenario.signs)}.png`;
    const card = cards.get(scenario.id);
    const svg = card ? findChartSurface(card) : null;
    if (svg && card) {
      const blob = await chartSvgToPngBlob(svg, {
        title: `${summary.title} — ${scenario.label}`,
        legend: collectChartLegend(card),
        scale: 2,
      });
      files[fileName] = new Uint8Array(await blob.arrayBuffer());
    }
    csv.push([
      num,
      scenario.label,
      scenario.actual ? 'Actual (real data)' : 'Synthetic',
      svg ? fileName : '(no chart)',
    ].map(csvCell).join(','));
  }

  files['index.csv'] = strToU8(csv.join('\r\n'));
  const zipped = zipSync(files, { level: 6 });
  downloadBlob(`${summary.visualId}-scenario-gallery.zip`, new Blob([zipped], { type: 'application/zip' }));
}
