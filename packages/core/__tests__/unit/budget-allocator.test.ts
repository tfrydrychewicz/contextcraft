import { describe, expect, it, vi } from 'vitest';

import {
  BudgetAllocator,
  allocateFlexPool,
  BudgetExceededError,
  InvalidBudgetError,
} from '../../src/index.js';
import type { SlotConfig } from '../../src/types/config.js';

describe('BudgetAllocator', () => {
  it('resolves fixed slots exactly', () => {
    const slots: Record<string, SlotConfig> = {
      a: { priority: 10, budget: { fixed: 100 } },
      b: { priority: 20, budget: { fixed: 200 } },
    };
    const r = new BudgetAllocator().resolve(slots, 500);
    expect(r.find((s) => s.name === 'a')!.budgetTokens).toBe(100);
    expect(r.find((s) => s.name === 'b')!.budgetTokens).toBe(200);
    expect(r.every((s) => s.content.length === 0)).toBe(true);
  });

  it('throws BudgetExceededError when fixed exceeds total', () => {
    const slots: Record<string, SlotConfig> = {
      a: { priority: 10, budget: { fixed: 600 } },
      b: { priority: 20, budget: { fixed: 500 } },
    };
    expect(() => new BudgetAllocator().resolve(slots, 1000)).toThrow(
      BudgetExceededError,
    );
  });

  it('throws InvalidBudgetError when sum of percents > 100', () => {
    const slots: Record<string, SlotConfig> = {
      a: { priority: 50, budget: { percent: 60 } },
      b: { priority: 40, budget: { percent: 50 } },
    };
    expect(() => new BudgetAllocator().resolve(slots, 10_000)).toThrow(
      InvalidBudgetError,
    );
  });

  it('resolves percent from pool after fixed', () => {
    const slots: Record<string, SlotConfig> = {
      sys: { priority: 100, budget: { fixed: 100 } },
      hist: { priority: 50, budget: { percent: 50 } },
    };
    const r = new BudgetAllocator().resolve(slots, 1100);
    expect(r.find((s) => s.name === 'sys')!.budgetTokens).toBe(100);
    // poolAfterFixed=1000 → 50% floor = 500; no flex → bonus 500 → hist = 1000
    expect(r.find((s) => s.name === 'hist')!.budgetTokens).toBe(1000);
  });

  it('flex receives remainder after fixed and percent floors', () => {
    const slots: Record<string, SlotConfig> = {
      f: { priority: 10, budget: { fixed: 100 } },
      p: { priority: 50, budget: { percent: 33 } },
      x: { priority: 80, budget: { flex: true } },
    };
    const total = 1000;
    const pool = 900;
    const pFloor = Math.floor((pool * 33) / 100); // 297
    const flexWant = pool - pFloor;
    const r = new BudgetAllocator().resolve(slots, total);
    expect(r.find((s) => s.name === 'x')!.budgetTokens).toBe(flexWant);
  });

  it('distributes bonus to percent slots when no flex exists', () => {
    const slots: Record<string, SlotConfig> = {
      a: { priority: 100, budget: { percent: 50 } },
      b: { priority: 90, budget: { percent: 40 } },
    };
    const total = 1003;
    const aFloor = Math.floor((total * 50) / 100);
    const bFloor = Math.floor((total * 40) / 100);
    const bonus = total - aFloor - bFloor;
    const r = new BudgetAllocator().resolve(slots, total);
    expect(r.find((s) => s.name === 'a')!.budgetTokens + r.find((s) => s.name === 'b')!.budgetTokens).toBe(
      aFloor + bFloor + bonus,
    );
    expect(aFloor + bFloor + bonus).toBe(total);
  });

  it('adds flex remainder to highest-priority flex slot', () => {
    const slots: Record<string, SlotConfig> = {
      low: { priority: 10, budget: { flex: true } },
      hi: { priority: 90, budget: { flex: true } },
    };
    const r = new BudgetAllocator().resolve(slots, 101);
    expect(r.find((s) => s.name === 'hi')!.budgetTokens).toBe(51);
    expect(r.find((s) => s.name === 'low')!.budgetTokens).toBe(50);
  });

  it('splits three unbounded flex slots equally when total divides evenly', () => {
    const slots: Record<string, SlotConfig> = {
      a: { priority: 10, budget: { flex: true } },
      b: { priority: 20, budget: { flex: true } },
      c: { priority: 30, budget: { flex: true } },
    };
    const r = new BudgetAllocator().resolve(slots, 99);
    expect(r.find((s) => s.name === 'a')!.budgetTokens).toBe(33);
    expect(r.find((s) => s.name === 'b')!.budgetTokens).toBe(33);
    expect(r.find((s) => s.name === 'c')!.budgetTokens).toBe(33);
  });

  it('percent 100% leaves no tokens for flex', () => {
    const slots: Record<string, SlotConfig> = {
      p: { priority: 50, budget: { percent: 100 } },
      x: { priority: 10, budget: { flex: true } },
    };
    const r = new BudgetAllocator().resolve(slots, 500);
    expect(r.find((s) => s.name === 'p')!.budgetTokens).toBe(500);
    expect(r.find((s) => s.name === 'x')!.budgetTokens).toBe(0);
  });

  it('respects bounded flex min/max', () => {
    const slots: Record<string, SlotConfig> = {
      b: {
        priority: 50,
        budget: { min: 10, max: 15, flex: true },
      },
      u: { priority: 40, budget: { flex: true } },
    };
    const r = new BudgetAllocator().resolve(slots, 100);
    const bTok = r.find((s) => s.name === 'b')!.budgetTokens;
    expect(bTok).toBeGreaterThanOrEqual(10);
    expect(bTok).toBeLessThanOrEqual(15);
    const sum = r.reduce((s, x) => s + x.budgetTokens, 0);
    expect(sum).toBeLessThanOrEqual(100);
  });

  it('emits slot:budget-resolved per slot', () => {
    const onEvent = vi.fn();
    const slots: Record<string, SlotConfig> = {
      z: { priority: 1, budget: { fixed: 1 } },
      y: { priority: 2, budget: { fixed: 2 } },
    };
    new BudgetAllocator({ onEvent }).resolve(slots, 100);
    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent.mock.calls[0]![0]).toMatchObject({
      type: 'slot:budget-resolved',
      slot: 'y',
      budgetTokens: 2,
    });
  });

  it('throws InvalidBudgetError for invalid totalBudget', () => {
    expect(() =>
      new BudgetAllocator().resolve(
        { a: { priority: 1, budget: { flex: true } } },
        1.5,
      ),
    ).toThrow(InvalidBudgetError);
  });

  it('returns empty array for empty slots', () => {
    expect(new BudgetAllocator().resolve({}, 100)).toEqual([]);
  });
});

describe('allocateFlexPool', () => {
  it('splits equally then gives remainder to highest priority', () => {
    const flexSlots = [
      { name: 'a', config: { priority: 10, budget: { flex: true } as const } },
      { name: 'b', config: { priority: 99, budget: { flex: true } as const } },
    ];
    const m = allocateFlexPool(flexSlots, 7);
    expect(m.get('a')).toBe(3);
    expect(m.get('b')).toBe(4);
  });

  it('splits three-way pool evenly when divisible', () => {
    const flexSlots = [
      { name: 'x', config: { priority: 1, budget: { flex: true } as const } },
      { name: 'y', config: { priority: 2, budget: { flex: true } as const } },
      { name: 'z', config: { priority: 3, budget: { flex: true } as const } },
    ];
    const m = allocateFlexPool(flexSlots, 300);
    expect(m.get('x')).toBe(100);
    expect(m.get('y')).toBe(100);
    expect(m.get('z')).toBe(100);
  });
});
