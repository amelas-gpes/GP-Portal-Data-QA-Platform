// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChartCard } from '../components/ChartCard';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function stubClipboardWriteText() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

describe('ChartCard copy affordance', () => {
  it('copies the aggregated series as TSV and confirms inline', async () => {
    const writeText = stubClipboardWriteText();
    const exportTsv = vi.fn(() => 'Period\tValue\nQ1 2024\t10');

    render(
      <ChartCard id="cashFlowSummary" title="Cash Flow Summary" help="help" exportTsv={exportTsv}>
        <svg />
      </ChartCard>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy Cash Flow Summary data as TSV' }));

    expect(await screen.findByText('Copied')).toBeTruthy();
    expect(exportTsv).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('Period\tValue\nQ1 2024\t10');
  });

  it('builds the TSV lazily — only on click, never during render', () => {
    stubClipboardWriteText();
    const exportTsv = vi.fn(() => '');
    render(
      <ChartCard id="ratioAnalysis" title="Ratio Analysis" help="help" exportTsv={exportTsv}>
        <svg />
      </ChartCard>,
    );
    expect(exportTsv).not.toHaveBeenCalled();
  });

  it('hides the copy-data button without exportTsv and both buttons when empty', () => {
    render(
      <ChartCard id="totalValue" title="Total Value" help="help">
        <svg />
      </ChartCard>,
    );
    expect(screen.queryByRole('button', { name: /data as TSV/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy Total Value as PNG' })).toBeTruthy();
    cleanup();

    render(
      <ChartCard id="totalValue" title="Total Value" help="help" empty>
        <div />
      </ChartCard>,
    );
    expect(screen.queryByRole('button', { name: /Copy Total Value/ })).toBeNull();
  });

  it('shows the error state when the rendered chart SVG is missing', async () => {
    render(
      <ChartCard id="capitalAtWork" title="Capital At Work" help="help">
        <div />
      </ChartCard>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy Capital At Work as PNG' }));
    expect(await screen.findByRole('button', { name: 'Copy failed' })).toBeTruthy();
  });
});
