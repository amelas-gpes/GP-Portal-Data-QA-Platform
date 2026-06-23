import { describe, expect, it, vi } from 'vitest';
import { createPeriodHoverStore } from '../utils/periodHoverStore';

describe('createPeriodHoverStore', () => {
  it('notifies subscribers only when the period key changes', () => {
    const store = createPeriodHoverStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.set('Q1 2024', 'chart-a');
    store.set('Q1 2024', 'chart-a');
    store.set('Q1 2024', 'chart-a');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe('Q1 2024');

    store.set('Q2 2024', 'chart-a');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('only the current owner can clear the hover (chart-to-chart handoff)', () => {
    const store = createPeriodHoverStore();
    const listener = vi.fn();
    store.subscribe(listener);

    // Chart A hovers Q1; chart B takes over the same bucket; A's late clear is ignored.
    store.set('Q1 2024', 'chart-a');
    store.set('Q1 2024', 'chart-b');
    store.clear('chart-a');
    expect(store.getSnapshot()).toBe('Q1 2024');

    store.clear('chart-b');
    expect(store.getSnapshot()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2); // set + owning clear only
  });

  it('clearing when nothing is set is a no-op', () => {
    const store = createPeriodHoverStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.clear('chart-a');
    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toBeNull();
  });

  it('unsubscribe stops notifications', () => {
    const store = createPeriodHoverStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.set('Q1 2024', 'chart-a');
    unsubscribe();
    store.set('Q2 2024', 'chart-a');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
