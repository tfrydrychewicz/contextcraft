/**
 * String token estimation for plugins and compression.
 *
 * @packageDocumentation
 */

import type { TokenCount } from './branded.js';

/** Count tokens for a string payload (e.g. tokenizer estimate). */
export interface TokenCountCache {
  count(content: string): TokenCount;
}
