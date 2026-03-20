/**
 * Error overflow strategy (§5.2).
 *
 * @packageDocumentation
 */

import { ContextOverflowError } from '../../errors.js';
import type { TokenCount } from '../../types/branded.js';
import type { OverflowContext, OverflowStrategyFn } from '../../types/config.js';
import type { ContentItem } from '../../types/content.js';

import { resolveOverflowCountItems } from './truncate-strategy.js';

function resolveSlotName(context: OverflowContext): string {
  const s = context.slot;
  return typeof s === 'string' && s.trim().length > 0 ? s : '<unknown>';
}

/**
 * If `countItems(items) > budget`, throws {@link ContextOverflowError};
 * otherwise returns `items` unchanged.
 */
export function errorOverflow(
  items: ContentItem[],
  budget: TokenCount,
  countItems: (xs: readonly ContentItem[]) => number,
  slot: string,
): ContentItem[] {
  const actual = countItems(items);
  if (actual > budget) {
    throw new ContextOverflowError(
      `Slot "${slot}" exceeded budget with overflow strategy "error"`,
      { slot, budgetTokens: budget, actualTokens: actual },
    );
  }
  return items;
}

/**
 * {@link OverflowStrategyFn} for `overflow: 'error'`.
 * Uses {@link OverflowContext.tokenAccountant} when present (via {@link resolveOverflowCountItems}).
 *
 * @remarks Declared `async` so over-budget throws surface as a rejected promise (not a sync throw).
 */
export const errorStrategy: OverflowStrategyFn = async (
  items,
  budget,
  context,
) => {
  const countItems = resolveOverflowCountItems(context);
  const slot = resolveSlotName(context);
  errorOverflow(items, budget, countItems, slot);
  return items;
};
