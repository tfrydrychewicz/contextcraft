import { describe, expect, it } from 'vitest';

import { ContextSnapshot } from '../../src/snapshot/context-snapshot.js';
import { toTokenCount } from '../../src/types/branded.js';
import type { CompiledMessage } from '../../src/types/content.js';
import type { SnapshotMeta } from '../../src/types/snapshot.js';

function meta(over: Partial<SnapshotMeta> = {}): SnapshotMeta {
  return {
    totalTokens: toTokenCount(1),
    totalBudget: toTokenCount(100),
    utilization: 0.01,
    waste: toTokenCount(0),
    slots: {},
    compressions: [],
    evictions: [],
    warnings: [],
    buildTimeMs: 0,
    builtAt: 0,
    ...over,
  };
}

function slot(
  name: string,
  used: number,
  budget: number,
  utilization: number,
  itemCount = 1,
) {
  return {
    name,
    budgetTokens: toTokenCount(budget),
    usedTokens: toTokenCount(used),
    itemCount,
    evictedCount: 0,
    overflowTriggered: false,
    utilization,
  };
}

describe('ContextSnapshot.diff (§12.1 — Phase 9.4)', () => {
  it('reports added messages when other extends this with trailing messages', () => {
    const a = ContextSnapshot.create({
      messages: [{ role: 'user', content: 'a' }],
      meta: meta(),
      model: 'm',
      immutable: false,
    });
    const b = ContextSnapshot.create({
      messages: [
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
      ],
      meta: meta(),
      model: 'm',
      immutable: false,
    });
    const d = a.diff(b);
    expect(d.added).toHaveLength(1);
    expect(d.added[0]!.content).toBe('b');
    expect(d.removed).toHaveLength(0);
    expect(d.modified).toHaveLength(0);
    expect(d.slotsModified).toHaveLength(0);
  });

  it('reports removed messages when other truncates trailing messages', () => {
    const a = ContextSnapshot.create({
      messages: [
        { role: 'user', content: 'a' },
        { role: 'user', content: 'b' },
      ],
      meta: meta(),
      model: 'm',
      immutable: false,
    });
    const b = ContextSnapshot.create({
      messages: [{ role: 'user', content: 'a' }],
      meta: meta(),
      model: 'm',
      immutable: false,
    });
    const d = a.diff(b);
    expect(d.removed).toHaveLength(1);
    expect(d.removed[0]!.content).toBe('b');
    expect(d.added).toHaveLength(0);
    expect(d.modified).toHaveLength(0);
  });

  it('reports modified when same index differs', () => {
    const a = ContextSnapshot.create({
      messages: [{ role: 'user', content: 'old' }],
      meta: meta(),
      model: 'm',
      immutable: false,
    });
    const b = ContextSnapshot.create({
      messages: [{ role: 'user', content: 'new' }],
      meta: meta(),
      model: 'm',
      immutable: false,
    });
    const d = a.diff(b);
    expect(d.modified).toHaveLength(1);
    expect(d.modified[0]!.index).toBe(0);
    expect(d.modified[0]!.before.content).toBe('old');
    expect(d.modified[0]!.after.content).toBe('new');
    expect(d.added).toHaveLength(0);
    expect(d.removed).toHaveLength(0);
  });

  it('reports slotsModified when shared slot meta differs', () => {
    const slotsA = { h: slot('h', 10, 100, 0.1) };
    const slotsB = { h: slot('h', 50, 100, 0.5, 2) };
    const a = ContextSnapshot.create({
      messages: [] as CompiledMessage[],
      meta: meta({ slots: slotsA }),
      model: 'm',
      immutable: false,
    });
    const b = ContextSnapshot.create({
      messages: [] as CompiledMessage[],
      meta: meta({ slots: slotsB }),
      model: 'm',
      immutable: false,
    });
    const d = a.diff(b);
    expect(d.slotsModified).toHaveLength(1);
    expect(d.slotsModified[0]!.name).toBe('h');
    expect(d.slotsModified[0]!.before.usedTokens).toBe(toTokenCount(10));
    expect(d.slotsModified[0]!.after.usedTokens).toBe(toTokenCount(50));
    expect(d.slotsModified[0]!.after.itemCount).toBe(2);
  });

  it('ignores slots only present in one snapshot (no slotsModified entry)', () => {
    const a = ContextSnapshot.create({
      messages: [],
      meta: meta({ slots: { x: slot('x', 1, 10, 0.1) } }),
      model: 'm',
      immutable: false,
    });
    const b = ContextSnapshot.create({
      messages: [],
      meta: meta({ slots: { y: slot('y', 1, 10, 0.1) } }),
      model: 'm',
      immutable: false,
    });
    const d = a.diff(b);
    expect(d.slotsModified).toHaveLength(0);
  });

  it('orders slotsModified by slot name', () => {
    const slotsA = {
      z: slot('z', 1, 10, 0.1),
      a: slot('a', 1, 10, 0.1),
    };
    const slotsB = {
      z: slot('z', 2, 10, 0.2),
      a: slot('a', 2, 10, 0.2),
    };
    const a = ContextSnapshot.create({
      messages: [],
      meta: meta({ slots: slotsA }),
      model: 'm',
      immutable: false,
    });
    const b = ContextSnapshot.create({
      messages: [],
      meta: meta({ slots: slotsB }),
      model: 'm',
      immutable: false,
    });
    const names = a.diff(b).slotsModified.map((s) => s.name);
    expect(names).toEqual(['a', 'z']);
  });
});
