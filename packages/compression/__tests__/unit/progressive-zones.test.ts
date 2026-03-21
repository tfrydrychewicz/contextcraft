import { describe, expect, it } from 'vitest';

import type { ProgressiveItem } from '../../src/progressive-types.js';
import { computeDynamicPreserveLastN, partitionProgressiveZones } from '../../src/progressive-zones.js';

function item(id: string, at: number, pinned?: boolean): ProgressiveItem {
  return {
    id,
    role: 'user',
    content: id,
    createdAt: at,
    ...(pinned ? { pinned: true } : {}),
  };
}

describe('partitionProgressiveZones (§8.1)', () => {
  it('puts last preserveLastN unpinned in recent and splits remainder into old/middle', () => {
    const a = item('a', 1);
    const b = item('b', 2);
    const c = item('c', 3);
    const d = item('d', 4);
    const z = partitionProgressiveZones([c, a, d, b], 2);
    expect(z.recent.map((x) => x.id)).toEqual(['c', 'd']);
    expect(z.old.map((x) => x.id)).toEqual(['a']);
    expect(z.middle.map((x) => x.id)).toEqual(['b']);
  });

  it('includes all pinned items in recent', () => {
    const a = item('a', 1);
    const b = item('b', 2, true);
    const c = item('c', 3);
    const d = item('d', 4);
    const z = partitionProgressiveZones([a, b, c, d], 1);
    expect(z.recent.map((x) => x.id).sort()).toEqual(['b', 'd']);
    expect(z.old.map((x) => x.id)).toEqual(['a']);
    expect(z.middle.map((x) => x.id)).toEqual(['c']);
  });

  it('orders recent by chronological index in full sort', () => {
    const items = [item('a', 1), item('b', 2, true), item('c', 3)];
    const z = partitionProgressiveZones(items, 1);
    expect(z.recent.map((x) => x.id)).toEqual(['b', 'c']);
  });
});

function mkItem(id: string, at: number, tokenSize: number): ProgressiveItem {
  return {
    id,
    role: 'user',
    content: 'x'.repeat(tokenSize),
    createdAt: at,
  };
}

describe('computeDynamicPreserveLastN', () => {
  const countTokens = (items: readonly ProgressiveItem[]) =>
    items.reduce((sum, i) => sum + (typeof i.content === 'string' ? i.content.length : 0), 0);

  it('returns ~50% of budget worth of recent items', () => {
    const items = Array.from({ length: 20 }, (_, i) => mkItem(`m${String(i)}`, i, 100));
    const result = computeDynamicPreserveLastN(items, 1000, countTokens);
    expect(result).toBe(5);
  });

  it('returns at least 4 even when budget is tiny', () => {
    const items = Array.from({ length: 20 }, (_, i) => mkItem(`m${String(i)}`, i, 100));
    const result = computeDynamicPreserveLastN(items, 200, countTokens);
    expect(result).toBeGreaterThanOrEqual(4);
  });

  it('returns the explicit override when provided', () => {
    const items = Array.from({ length: 20 }, (_, i) => mkItem(`m${String(i)}`, i, 100));
    const result = computeDynamicPreserveLastN(items, 10000, countTokens, 3);
    expect(result).toBe(3);
  });

  it('scales up with larger budgets', () => {
    const items = Array.from({ length: 50 }, (_, i) => mkItem(`m${String(i)}`, i, 100));
    const small = computeDynamicPreserveLastN(items, 1000, countTokens);
    const large = computeDynamicPreserveLastN(items, 5000, countTokens);
    expect(large).toBeGreaterThan(small);
  });
});
