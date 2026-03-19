/**
 * Fast character-based token estimation (~4 UTF-16 code units per token).
 *
 * @packageDocumentation
 */

import {
  toTokenCount,
  type CompiledContentPart,
  type CompiledMessage,
  type TokenCount,
} from 'contextcraft';

import type { Tokenizer } from './tokenizer.js';

/** Default UTF-16 code units per estimated token (§18.2). */
export const CHARS_PER_TOKEN_ESTIMATE = 4;

/**
 * Provider-style overhead used only by {@link CharEstimatorTokenizer.countMessages}.
 * Aligns with OpenAI-style defaults from §9.4 (refined further in phase 2.4).
 */
const PER_MESSAGE_OVERHEAD_TOKENS = 4;

const PER_CONVERSATION_OVERHEAD_TOKENS = 2;

function estimateTokensFromCharLength(charLength: number): number {
  if (charLength <= 0) {
    return 0;
  }
  return Math.ceil(charLength / CHARS_PER_TOKEN_ESTIMATE);
}

function compiledPartsToString(parts: CompiledContentPart[]): string {
  let s = '';
  for (const p of parts) {
    switch (p.type) {
      case 'text': {
        s += p.text;
        break;
      }
      case 'image_url': {
        s += p.image_url.url;
        break;
      }
      case 'image_base64': {
        s += p.image_base64.data;
        break;
      }
      default: {
        break;
      }
    }
  }
  return s;
}

function messageBodyToString(content: CompiledMessage['content']): string {
  return typeof content === 'string' ? content : compiledPartsToString(content);
}

/**
 * Serialize a compiled message into a single string for length-based estimation.
 * Not identical to any one provider’s wire format — only used for rough counts.
 */
export function compiledMessageToEstimationString(message: CompiledMessage): string {
  const nameLine = message.name !== undefined ? `${message.name}\n` : '';
  return `${message.role}\n${nameLine}${messageBodyToString(message.content)}`;
}

/**
 * Char-length tokenizer: `ceil(length / 4)` tokens per string (0 when empty).
 *
 * `encode` returns one 32-bit FNV-1a fingerprint per chunk (same length as {@link count}).
 * {@link decode} is a no-op concatenation — hashes are not reversible; use a model-specific
 * tokenizer when you need real encode/decode.
 */
export class CharEstimatorTokenizer implements Tokenizer {
  readonly id = 'char-estimator';

  /** @inheritdoc */
  count(text: string): TokenCount {
    return toTokenCount(estimateTokensFromCharLength(text.length));
  }

  /** @inheritdoc */
  countMessage(message: CompiledMessage): TokenCount {
    return toTokenCount(this.messageCostUnits(message));
  }

  /** @inheritdoc */
  countMessages(messages: CompiledMessage[]): TokenCount {
    if (messages.length === 0) {
      return toTokenCount(0);
    }
    let sum = PER_CONVERSATION_OVERHEAD_TOKENS;
    for (const m of messages) {
      sum += this.messageCostUnits(m);
    }
    return toTokenCount(sum);
  }

  /** @inheritdoc */
  encode(text: string): number[] {
    const out: number[] = [];
    for (let i = 0; i < text.length; i += CHARS_PER_TOKEN_ESTIMATE) {
      out.push(fnv1a32(text.slice(i, i + CHARS_PER_TOKEN_ESTIMATE)));
    }
    return out;
  }

  /** @inheritdoc */
  decode(tokens: number[]): string {
    void tokens;
    return '';
  }

  /** @inheritdoc */
  truncateToFit(text: string, maxTokens: number): string {
    if (maxTokens <= 0) {
      return '';
    }
    const maxChars = maxTokens * CHARS_PER_TOKEN_ESTIMATE;
    if (text.length <= maxChars) {
      return text;
    }
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const n = estimateTokensFromCharLength(mid);
      if (n <= maxTokens) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return text.slice(0, lo);
  }

  /** Raw token units for one message (before conversation-level overhead). */
  private messageCostUnits(message: CompiledMessage): number {
    const base = estimateTokensFromCharLength(
      compiledMessageToEstimationString(message).length,
    );
    return base + PER_MESSAGE_OVERHEAD_TOKENS;
  }
}

/** FNV-1a 32-bit — stable fingerprint for a chunk (not reversible). */
function fnv1a32(chunk: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < chunk.length; i++) {
    h ^= chunk.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
