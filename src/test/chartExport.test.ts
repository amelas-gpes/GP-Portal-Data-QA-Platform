import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PieModel } from '../types';
import { copyTsv, pieModelToTsv, pngFileName, seriesToTsv, tsvCell } from '../utils/chartExport';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tsvCell', () => {
  it('passes integers and finite numbers through without locale formatting', () => {
    expect(tsvCell(1250000)).toBe('1250000');
    expect(tsvCell(-42.5)).toBe('-42.5');
    expect(tsvCell(0)).toBe('0');
  });

  it('trims float noise so sums paste cleanly into Excel', () => {
    expect(tsvCell(0.1 + 0.2)).toBe('0.3');
    expect(tsvCell(123.4567894999)).toBe('123.456789');
  });

  it('blanks null, undefined, and non-finite numbers', () => {
    expect(tsvCell(null)).toBe('');
    expect(tsvCell(undefined)).toBe('');
    expect(tsvCell(Number.NaN)).toBe('');
    expect(tsvCell(Number.POSITIVE_INFINITY)).toBe('');
  });

  it('strips tabs and newlines from text so the grid shape survives', () => {
    expect(tsvCell('Q1\t2024')).toBe('Q1 2024');
    expect(tsvCell('line one\r\nline two')).toBe('line one line two');
  });
});

describe('seriesToTsv', () => {
  const rows = [
    { label: 'Q1 2024', contributions: 100.5, distributions: 25 },
    { label: 'Q2 2024', contributions: 200, distributions: null },
  ];
  const columns = [
    ['label', 'Period'],
    ['contributions', 'Contributions'],
    ['distributions', 'Distributions'],
  ] as const;

  it('emits a header row plus one tab-separated row per point', () => {
    const tsv = seriesToTsv(rows, columns);
    expect(tsv.split('\n')).toEqual([
      'Period\tContributions\tDistributions',
      'Q1 2024\t100.5\t25',
      'Q2 2024\t200\t',
    ]);
  });

  it('appends ghost baseline columns when `${key}__base` fields are present', () => {
    const ghostRows = [
      { label: 'Q1 2024', contributions: 100, contributions__base: 90 },
      { label: 'Q2 2024', contributions: 200, contributions__base: 180 },
    ];
    const tsv = seriesToTsv(ghostRows, [['label', 'Period'], ['contributions', 'Contributions']], {
      baselineLabel: 'production',
    });
    const lines = tsv.split('\n');
    expect(lines[0]).toBe('Period\tContributions\tContributions (production)');
    expect(lines[1]).toBe('Q1 2024\t100\t90');
    expect(lines[2]).toBe('Q2 2024\t200\t180');
  });

  it('does not add baseline columns without ghost fields or without the option', () => {
    expect(seriesToTsv(rows, columns, { baselineLabel: 'production' }).split('\n')[0]).toBe(
      'Period\tContributions\tDistributions',
    );
    const ghostRows = [{ label: 'Q1 2024', contributions: 100, contributions__base: 90 }];
    expect(seriesToTsv(ghostRows, [['label', 'Period'], ['contributions', 'Contributions']]).split('\n')[0]).toBe(
      'Period\tContributions',
    );
  });
});

describe('pieModelToTsv', () => {
  it('exports inner categories then outer detail segments with signed values', () => {
    const model: PieModel = {
      suppressed: false,
      reason: null,
      inner: [
        { name: 'Carry', value: 120, signedValue: 120, tooltipMetricKey: 'carry', rowCount: 3, tooltipMetrics: {} },
      ],
      outer: [
        { name: 'PRG1', value: 70, signedValue: -70, category: 'Carry', tooltipMetricKey: 'carry', rowCount: 2, tooltipMetrics: {} },
        { name: 'PRG2', value: 50, signedValue: 50, category: 'Carry', tooltipMetricKey: 'carry', rowCount: 1, tooltipMetrics: {} },
      ],
    };
    expect(pieModelToTsv(model).split('\n')).toEqual([
      'Ring\tSegment\tCategory\tPlotted Value\tSigned Value',
      'category\tCarry\tCarry\t120\t120',
      'detail\tPRG1\tCarry\t70\t-70',
      'detail\tPRG2\tCarry\t50\t50',
    ]);
  });
});

describe('copyTsv', () => {
  it('writes the TSV through navigator.clipboard.writeText', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(copyTsv('a\tb')).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('a\tb');
  });

  it('rejects when the async clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    await expect(copyTsv('a\tb')).rejects.toThrow('Clipboard text copy is not available');
  });
});

describe('pngFileName', () => {
  it('slugs the card title and always ends in .png', () => {
    expect(pngFileName('Cash Flow Summary')).toBe('cash-flow-summary.png');
    expect(pngFileName('LTD Commitment Summary — Bar!')).toBe('ltd-commitment-summary-bar.png');
    expect(pngFileName('***')).toBe('chart.png');
  });
});
