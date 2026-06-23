// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useInvestorHistory } from '../hooks/useInvestorHistory';

// The harness plays the App role: back()/forward() call navigate, and the test
// echoes the navigation back as a currentKey change, exactly like the reducer
// selection round-trip.
function createHarness(initialKey: string | null = null) {
  const navigate = vi.fn();
  const harness = renderHook(
    ({ currentKey }: { currentKey: string | null }) => useInvestorHistory(currentKey, navigate),
    { initialProps: { currentKey: initialKey } },
  );
  const visit = (key: string | null) => harness.rerender({ currentKey: key });
  return { navigate, visit, result: harness.result };
}

describe('useInvestorHistory', () => {
  it('records visits and walks back and forward through them', () => {
    const { navigate, visit, result } = createHarness('A');
    visit('B');
    visit('C');

    expect(result.current.back()).toBe(true);
    expect(navigate).toHaveBeenLastCalledWith('B');
    visit('B');

    expect(result.current.back()).toBe(true);
    expect(navigate).toHaveBeenLastCalledWith('A');
    visit('A');

    expect(result.current.back()).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(2);

    expect(result.current.forward()).toBe(true);
    expect(navigate).toHaveBeenLastCalledWith('B');
    visit('B');

    expect(result.current.forward()).toBe(true);
    expect(navigate).toHaveBeenLastCalledWith('C');
    visit('C');

    expect(result.current.forward()).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(4);
  });

  it('truncates the forward stack when a new visit follows going back (browser-style)', () => {
    const { navigate, visit, result } = createHarness('A');
    visit('B');
    visit('C');

    result.current.back();
    visit('B');
    visit('D'); // new navigation while a forward entry (C) exists

    expect(result.current.forward()).toBe(false); // C is gone
    expect(result.current.back()).toBe(true);
    expect(navigate).toHaveBeenLastCalledWith('B');
    visit('B');
    expect(result.current.back()).toBe(true);
    expect(navigate).toHaveBeenLastCalledWith('A');
  });

  it('records alternating j/k steps as separate entries', () => {
    const { navigate, visit, result } = createHarness('A');
    visit('B');
    visit('A');
    visit('B');

    result.current.back();
    expect(navigate).toHaveBeenLastCalledWith('A');
    visit('A');
    result.current.back();
    expect(navigate).toHaveBeenLastCalledWith('B');
    visit('B');
    result.current.back();
    expect(navigate).toHaveBeenLastCalledWith('A');
    visit('A');
    expect(result.current.back()).toBe(false);
  });

  it('keeps getRecent newest-first, deduped, and capped', () => {
    const { visit, result } = createHarness('A');
    visit('B');
    visit('C');
    expect(result.current.getRecent()).toEqual(['C', 'B', 'A']);

    visit('B'); // revisit moves B to the front without duplicating it
    expect(result.current.getRecent()).toEqual(['B', 'C', 'A']);

    for (let index = 0; index < 12; index++) visit(`K${index}`);
    expect(result.current.getRecent()).toHaveLength(9); // 8 + the current visit
    expect(result.current.getRecent()[0]).toBe('K11');
  });

  it('updates recency when travelling via back', () => {
    const { visit, result } = createHarness('A');
    visit('B');
    visit('C');
    result.current.back();
    visit('B');
    expect(result.current.getRecent()[0]).toBe('B');
  });

  it('reset forgets the stack and the recent list', () => {
    const { navigate, visit, result } = createHarness('A');
    visit('B');
    result.current.reset();

    expect(result.current.back()).toBe(false);
    expect(result.current.forward()).toBe(false);
    expect(result.current.getRecent()).toEqual([]);
    expect(navigate).not.toHaveBeenCalled();

    visit('C'); // history restarts cleanly after reset
    expect(result.current.getRecent()).toEqual(['C']);
    expect(result.current.back()).toBe(false);
  });

  it('ignores null selections', () => {
    const { visit, result } = createHarness(null);
    expect(result.current.back()).toBe(false);
    visit('A');
    visit(null);
    expect(result.current.getRecent()).toEqual(['A']);
    expect(result.current.back()).toBe(false);
  });
});
