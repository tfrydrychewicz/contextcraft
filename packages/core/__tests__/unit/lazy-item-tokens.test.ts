import { describe, expect, it, vi } from 'vitest';

import { createContentItem } from '../../src/content/content-store.js';
import {
  fillMissingContentItemTokens,
  sumCachedItemTokensWithLazyFill,
  sumCachedOrEstimatedItemTokens,
  tryResolveTokenizerForLazyFill,
  wrapContentItemLazyTokens,
} from '../../src/content/lazy-item-tokens.js';
import { toTokenCount } from '../../src/types/branded.js';
import type { ProviderAdapter, Tokenizer } from '../../src/types/provider.js';

describe('lazy item token helpers', () => {
  it('wrapContentItemLazyTokens resolves tokens on first read', () => {
    const base = createContentItem({
      slot: 'h',
      role: 'user',
      content: 'hello',
    });
    const wrapped = wrapContentItemLazyTokens(base, () => toTokenCount(99));
    expect(wrapped.tokens).toBe(99);
    expect(base.tokens).toBe(99);
    expect(wrapped.tokens).toBe(99);
  });

  it('fillMissingContentItemTokens uses countBatch for string rows', () => {
    const countBatch = vi.fn((texts: readonly string[]) =>
      texts.map((t) => toTokenCount(t.length)),
    );
    const tokenizer = {
      id: 'stub',
      count: (s: string) => toTokenCount(s.length),
      countBatch,
      countMessage: () => toTokenCount(0),
      countMessages: () => toTokenCount(0),
      encode: () => [],
      decode: () => '',
      truncateToFit: (t: string) => t,
    };
    const a = createContentItem({ slot: 'h', role: 'user', content: 'aa' });
    const b = createContentItem({ slot: 'h', role: 'user', content: 'bbb' });
    fillMissingContentItemTokens({ items: [a, b], tokenizer });
    expect(countBatch).toHaveBeenCalledWith(['aa', 'bbb']);
    expect(a.tokens).toEqual(toTokenCount(2));
    expect(b.tokens).toEqual(toTokenCount(3));
  });

  it('sumCachedOrEstimatedItemTokens uses estimate when tokens unset', () => {
    const item = createContentItem({ slot: 'h', role: 'user', content: 'abcd' });
    expect(sumCachedOrEstimatedItemTokens([item])).toBe(1);
  });

  it('sumCachedItemTokensWithLazyFill invokes fill for missing', () => {
    const item = createContentItem({ slot: 'h', role: 'user', content: 'x' });
    const fill = vi.fn((missing: typeof item[]) => {
      for (const m of missing) {
        m.tokens = toTokenCount(5);
      }
    });
    expect(sumCachedItemTokensWithLazyFill([item], fill)).toBe(5);
    expect(fill).toHaveBeenCalledTimes(1);
  });

  it('tryResolveTokenizerForLazyFill picks adapter by provider hint', () => {
    const inner: Tokenizer = {
      id: 't',
      count: () => toTokenCount(0),
      countBatch: () => [],
      countMessage: () => toTokenCount(0),
      countMessages: () => toTokenCount(0),
      encode: () => [],
      decode: () => '',
      truncateToFit: (s: string) => s,
    };
    const getTokenizer = vi.fn(() => inner);
    const adapter = { id: 'openai', getTokenizer } as unknown as ProviderAdapter;
    const t = tryResolveTokenizerForLazyFill(
      'gpt-4o-mini',
      { openai: adapter },
      'openai',
    );
    expect(t).toBe(inner);
    expect(getTokenizer).toHaveBeenCalledWith('gpt-4o-mini');
  });
});
