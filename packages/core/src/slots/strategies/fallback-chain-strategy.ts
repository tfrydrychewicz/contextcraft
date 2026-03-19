/**
 * Fallback overflow chain: summarize → compress → truncate → error (§15.2 — Phase 4.7).
 *
 * @packageDocumentation
 */

import { CompressionFailedError, InvalidConfigError } from '../../errors.js';
import type { OverflowStrategyFn } from '../../types/config.js';

import { resolveOverflowCountItems } from './truncate-strategy.js';

/** Ordered step ids (for logging / tests). */
export const FALLBACK_CHAIN_STEPS = [
  'summarize',
  'compress',
  'truncate',
] as const;

export type FallbackChainStep = (typeof FALLBACK_CHAIN_STEPS)[number];

function isRecoverableForStep(
  step: FallbackChainStep,
  e: unknown,
): e is CompressionFailedError | InvalidConfigError {
  if (e instanceof CompressionFailedError) {
    return true;
  }
  if (step === 'summarize' || step === 'compress') {
    return e instanceof InvalidConfigError;
  }
  return false;
}

export type FallbackChainStrategyDeps = {
  readonly summarize: OverflowStrategyFn;
  readonly compress: OverflowStrategyFn;
  readonly truncate: OverflowStrategyFn;
  readonly error: OverflowStrategyFn;
};

/**
 * Runs {@link FALLBACK_CHAIN_STEPS} in order. On {@link CompressionFailedError}, or
 * {@link InvalidConfigError} from summarize/compress (e.g. not implemented), logs a warning
 * and continues with the same items. After truncate, if still over budget, runs `error`.
 */
export function createFallbackChainStrategy(
  deps: FallbackChainStrategyDeps,
): OverflowStrategyFn {
  return async (items, budget, context) => {
    const countItems = resolveOverflowCountItems(context);
    if (countItems(items) <= budget) {
      return items;
    }

    let current = items;
    const steps: Array<{ step: FallbackChainStep; fn: OverflowStrategyFn }> = [
      { step: 'summarize', fn: deps.summarize },
      { step: 'compress', fn: deps.compress },
      { step: 'truncate', fn: deps.truncate },
    ];

    for (const { step, fn } of steps) {
      try {
        const out = await fn(current, budget, context);
        if (countItems(out) <= budget) {
          return out;
        }
        current = out;
      } catch (e) {
        if (isRecoverableForStep(step, e)) {
          context.logger?.warn?.(
            `[fallback-chain] step "${step}" skipped: ${e instanceof Error ? e.message : String(e)}`,
          );
          continue;
        }
        throw e;
      }
    }

    if (countItems(current) > budget) {
      return deps.error(current, budget, context);
    }

    return current;
  };
}
