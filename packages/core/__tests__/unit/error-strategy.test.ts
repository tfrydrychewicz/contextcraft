import { describe, expect, it } from 'vitest';

import {
  ContextOverflowError,
  createContentItem,
  errorOverflow,
  errorStrategy,
  sumCachedItemTokens,
  toTokenCount,
  type TokenAccountant,
} from '../../src/index.js';
import type { OverflowContext } from '../../src/types/config.js';

describe('errorStrategy / errorOverflow (§5.2)', () => {
  it('returns items unchanged when within budget', async () => {
    const item = createContentItem({
      slot: 'e',
      role: 'user',
      content: 'x',
      tokens: toTokenCount(10),
    });
    const out = await errorStrategy([item], toTokenCount(50), { slot: 'e' });
    expect(out).toEqual([item]);
  });

  it('throws ContextOverflowError with slot, budgetTokens, actualTokens when over budget', async () => {
    const item = createContentItem({
      slot: 'e',
      role: 'user',
      content: 'x',
      tokens: toTokenCount(100),
    });
    await expect(
      errorStrategy([item], toTokenCount(50), { slot: 'e' }),
    ).rejects.toSatisfy((e: unknown) => {
      expect(e).toBeInstanceOf(ContextOverflowError);
      const err = e as ContextOverflowError;
      expect(err.slot).toBe('e');
      expect(err.budgetTokens).toBe(50);
      expect(err.actualTokens).toBe(100);
      return true;
    });
  });

  it('errorOverflow and errorStrategy use TokenAccountant for actual total', async () => {
    const item = createContentItem({
      slot: 'e',
      role: 'user',
      content: 'x',
      tokens: toTokenCount(10),
    });
    const accountant: TokenAccountant = {
      countItems: (xs) => sumCachedItemTokens(xs) * 3,
    };
    expect(() =>
      errorOverflow([item], toTokenCount(25), accountant.countItems, 'e'),
    ).toThrow(ContextOverflowError);

    const ctx: OverflowContext = { slot: 'e', tokenAccountant: accountant };
    await expect(errorStrategy([item], toTokenCount(25), ctx)).rejects.toThrow(
      ContextOverflowError,
    );
  });
});
