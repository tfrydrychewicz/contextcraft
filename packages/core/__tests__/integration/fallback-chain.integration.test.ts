import { describe, expect, it, vi } from 'vitest';

import {
  CompressionFailedError,
  createContentItem,
  OverflowEngine,
  toTokenCount,
  type OverflowEngineInputSlot,
  type SlotConfig,
} from '../../src/index.js';

function countSum(items: readonly { tokens?: number }[]): number {
  return items.reduce((s, i) => s + (i.tokens ?? 0), 0);
}

describe('fallback-chain overflow (§15.2 integration)', () => {
  it('when summarize throws CompressionFailedError, engine falls back to truncate', async () => {
    const warn = vi.fn();
    const flex: SlotConfig = {
      priority: 50,
      budget: { flex: true },
      overflow: 'fallback-chain',
    };

    const a = createContentItem({
      slot: 'history',
      role: 'user',
      content: 'a',
      tokens: toTokenCount(40),
    });
    const b = createContentItem({
      slot: 'history',
      role: 'user',
      content: 'b',
      tokens: toTokenCount(40),
    });

    const inputSlot: OverflowEngineInputSlot = {
      name: 'history',
      priority: 50,
      budgetTokens: 50,
      config: flex,
      content: [a, b],
    };

    const engine = new OverflowEngine({
      countTokens: countSum,
      strategyLogger: {
        info: vi.fn(),
        warn,
        error: vi.fn(),
      },
      strategies: {
        summarize: async () => {
          throw new CompressionFailedError('LLM summarize failed', {
            fallbackStrategy: 'truncate',
          });
        },
      },
    });

    const out = await engine.resolve([inputSlot]);
    expect(out[0]!.content).toHaveLength(1);
    expect(out[0]!.content[0]!.id).toBe(b.id);
    expect(warn).toHaveBeenCalled();
    const msg = String(warn.mock.calls[0]?.[0] ?? '');
    expect(msg).toMatch(/\[fallback-chain\]/);
    expect(msg).toMatch(/summarize/);
  });
});
