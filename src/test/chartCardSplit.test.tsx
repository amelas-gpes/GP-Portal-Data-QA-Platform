// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ChartCard } from '../components/ChartCard';

// jsdom does not implement window.scrollTo; the expand effect calls it.
beforeAll(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  cleanup();
});

const chartRegion = () => document.querySelector('.chart-card__chart-region') as HTMLElement | null;

describe('ChartCard expanded split (chart over data table)', () => {
  it('renders the detail panel and splitter only when expanded with detail', () => {
    const { rerender } = render(
      <ChartCard id="commitmentSummary" title="Commitment Summary" help="help" detail={<div data-testid="rows">rows</div>}>
        <svg />
      </ChartCard>,
    );
    // Detail is provided but the card is collapsed → no split, no table.
    expect(screen.queryByTestId('rows')).toBeNull();
    expect(document.querySelector('.chart-card__splitter')).toBeNull();

    rerender(
      <ChartCard id="commitmentSummary" title="Commitment Summary" help="help" expanded detail={<div data-testid="rows">rows</div>}>
        <svg />
      </ChartCard>,
    );
    expect(screen.getByTestId('rows')).toBeTruthy();
    expect(document.querySelector('.chart-card__splitter')).toBeTruthy();
    expect(chartRegion()).toBeTruthy();
  });

  it('does not split when expanded without a detail panel', () => {
    render(
      <ChartCard id="totalValue" title="Total Value" help="help" expanded>
        <svg />
      </ChartCard>,
    );
    expect(document.querySelector('.chart-card__splitter')).toBeNull();
    expect(chartRegion()).toBeNull();
  });

  it('resizes the chart region via the splitter keyboard handles', () => {
    render(
      <ChartCard id="cashFlowSummary" title="Cash Flow Summary" help="help" expanded detail={<div>rows</div>}>
        <svg />
      </ChartCard>,
    );
    const splitter = screen.getByRole('separator', { name: /Resize the Cash Flow Summary chart/ });
    const startHeight = chartRegion()?.style.height;
    expect(startHeight).toMatch(/%$/);

    // ArrowDown grows the chart region; ArrowUp shrinks it.
    fireEvent.keyDown(splitter, { key: 'ArrowDown' });
    const grown = parseFloat(chartRegion()!.style.height);
    expect(grown).toBeGreaterThan(parseFloat(startHeight!));

    fireEvent.keyDown(splitter, { key: 'ArrowUp' });
    fireEvent.keyDown(splitter, { key: 'ArrowUp' });
    expect(parseFloat(chartRegion()!.style.height)).toBeLessThan(grown);
  });

  it('clamps the chart fraction within bounds and exposes it on the separator', () => {
    render(
      <ChartCard id="ratioAnalysis" title="Ratio Analysis" help="help" expanded detail={<div>rows</div>}>
        <svg />
      </ChartCard>,
    );
    const splitter = screen.getByRole('separator');
    // Drive it well past the maximum; it must clamp, not run away.
    for (let i = 0; i < 40; i++) fireEvent.keyDown(splitter, { key: 'ArrowDown' });
    const max = Number(splitter.getAttribute('aria-valuemax'));
    expect(parseFloat(chartRegion()!.style.height)).toBeLessThanOrEqual(max);
    expect(Number(splitter.getAttribute('aria-valuenow'))).toBeLessThanOrEqual(max);
  });
});
