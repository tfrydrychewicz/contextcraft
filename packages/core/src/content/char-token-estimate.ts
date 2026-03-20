/**
 * Character-length token estimates for non-authoritative paths (design §18.2 predictive budgeting).
 *
 * @packageDocumentation
 */

import type { ContentItem, MultimodalContent } from '../types/content.js';

/** Default “~4 UTF-16 code units per token” heuristic (aligned with common char estimators). */
export const DEFAULT_CHARS_PER_TOKEN_ESTIMATE = 4;

/**
 * Estimates token count from plain text length (ceil division).
 */
export function estimateTokenCountFromPlainTextLen(
  length: number,
  charsPerToken: number = DEFAULT_CHARS_PER_TOKEN_ESTIMATE,
): number {
  if (length <= 0) {
    return 0;
  }
  return Math.ceil(length / Math.max(1, charsPerToken));
}

function multimodalApproxLength(blocks: readonly MultimodalContent[]): number {
  let len = 0;
  for (const b of blocks) {
    if (b.type === 'text') {
      len += b.text.length;
    } else {
      len += 64;
    }
  }
  return len;
}

/**
 * Estimates tokens from multimodal blocks using text length + a small constant per non-text block.
 */
export function estimateTokensFromMultimodalContent(
  content: readonly MultimodalContent[],
  charsPerToken?: number,
): number {
  return estimateTokenCountFromPlainTextLen(multimodalApproxLength(content), charsPerToken);
}

/**
 * Estimates tokens from {@link ContentItem} `content` when `tokens` is unset (predictive / preview paths).
 */
export function estimateTokensFromContentPayload(content: ContentItem['content']): number {
  if (typeof content === 'string') {
    return estimateTokenCountFromPlainTextLen(content.length);
  }
  return estimateTokensFromMultimodalContent(content);
}
