import { describe, expect, it, vi } from 'vitest';

import { runProgressiveSummarize } from '../../src/progressive-summarizer.js';
import type { ProgressiveItem } from '../../src/progressive-types.js';

function mk(id: string, at: number, content: string, pinned?: boolean): ProgressiveItem {
  return {
    id,
    role: 'user',
    content,
    createdAt: at,
    ...(pinned ? { pinned: true } : {}),
    slot: 's',
  };
}

function countChars(items: readonly ProgressiveItem[]): number {
  let s = 0;
  for (const i of items) {
    s += typeof i.content === 'string' ? i.content.length : 0;
  }
  return s;
}

describe('runProgressiveSummarize (§8.1)', () => {
  it('returns sorted input when already under budget', async () => {
    const items = [mk('b', 2, 'bb'), mk('a', 1, 'aa')];
    const summarizeText = vi.fn(async () => 'nope');
    const out = await runProgressiveSummarize(items, 100, {
      summarizeText,
      countItemsTokens: countChars,
      countTextTokens: (t) => t.length,
      slot: 's',
      createId: () => `id-${Math.random()}`,
    });
    expect(summarizeText).not.toHaveBeenCalled();
    expect(out.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('calls layer 2 for old zone then fits budget', async () => {
    const items = [
      mk('o1', 1, 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'),
      mk('o2', 2, 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'),
      mk('r1', 3, 'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyy'),
      mk('r2', 4, 'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyy'),
    ];
    const summarizeText = vi.fn(async ({ layer }) => (layer === 2 ? 'L2' : 'X'));
    const out = await runProgressiveSummarize(items, 70, {
      preserveLastN: 2,
      summarizeText,
      countItemsTokens: countChars,
      countTextTokens: (t) => t.length,
      slot: 's',
      createId: (() => {
        let n = 0;
        return () => `s-${n++}`;
      })(),
    });
    expect(summarizeText).toHaveBeenCalled();
    expect(out.some((i) => i.content === 'L2')).toBe(true);
    expect(countChars(out)).toBeLessThanOrEqual(70);
  });

  it('appends target token count to system prompt', async () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      mk(`m${String(i)}`, i, 'x'.repeat(100)),
    );
    const calls: Array<{ systemPrompt: string; targetTokens?: number }> = [];
    const summarizeText = vi.fn(async (params: { systemPrompt: string; targetTokens?: number }) => {
      calls.push({ systemPrompt: params.systemPrompt, targetTokens: params.targetTokens });
      return 'summary';
    });
    await runProgressiveSummarize(items, 500, {
      preserveLastN: 2,
      summarizeText,
      countItemsTokens: countChars,
      countTextTokens: (t) => t.length,
      slot: 's',
      createId: (() => {
        let n = 0;
        return () => `s-${n++}`;
      })(),
    });
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.systemPrompt).toContain('Target output length');
      expect(call.systemPrompt).toContain('tokens');
      expect(call.targetTokens).toBeTypeOf('number');
      expect(call.targetTokens).toBeGreaterThan(0);
    }
  });

  it('produces multiple summary segments for large old zones', async () => {
    const items = Array.from({ length: 30 }, (_, i) =>
      mk(`m${String(i)}`, i, 'x'.repeat(500)),
    );
    let idCounter = 0;
    const summarizeText = vi.fn(async () => 'segment-summary-' + String(idCounter++));
    const out = await runProgressiveSummarize(items, 5000, {
      preserveLastN: 4,
      summarizeText,
      countItemsTokens: countChars,
      countTextTokens: (t) => t.length,
      slot: 's',
      createId: (() => {
        let n = 0;
        return () => `s-${n++}`;
      })(),
    });
    const summaryItems = out.filter((i) => i.summarizes && i.summarizes.length > 0);
    expect(summaryItems.length).toBeGreaterThan(1);
  });

  it('preserves more recent items when budget allows (dynamic preserveLastN omitted)', async () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      mk(`m${String(i)}`, i, 'x'.repeat(100)),
    );
    const summarizeText = vi.fn(async () => 'summary');
    const out = await runProgressiveSummarize(items, 1200, {
      summarizeText,
      countItemsTokens: countChars,
      countTextTokens: (t) => t.length,
      slot: 's',
      createId: (() => {
        let n = 0;
        return () => `s-${n++}`;
      })(),
    });
    const nonSummaryItems = out.filter((i) => !i.summarizes || i.summarizes.length === 0);
    expect(nonSummaryItems.length).toBeGreaterThanOrEqual(4);
  });

  it('still works with preserveLastN=4 when explicitly configured', async () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      mk(`m${String(i)}`, i, 'x'.repeat(100)),
    );
    const summarizeText = vi.fn(async () => 'summary');
    const out = await runProgressiveSummarize(items, 600, {
      preserveLastN: 4,
      summarizeText,
      countItemsTokens: countChars,
      countTextTokens: (t) => t.length,
      slot: 's',
      createId: (() => {
        let n = 0;
        return () => `s-${n++}`;
      })(),
    });
    expect(countChars(out)).toBeLessThanOrEqual(600);
    expect(out.some((i) => i.summarizes && i.summarizes.length > 0)).toBe(true);
  });
});
