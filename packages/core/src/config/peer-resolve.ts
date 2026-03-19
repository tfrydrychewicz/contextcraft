/**
 * Optional tokenizer peer dependency resolution (Phase 5.3).
 *
 * @packageDocumentation
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { TokenizerNotFoundError } from '../errors.js';

const requireFromHere = createRequire(fileURLToPath(import.meta.url));

/**
 * Returns true if `packageName` can be resolved from this package (Node only).
 */
export function tryResolveNpmPackage(packageName: string): boolean {
  try {
    requireFromHere.resolve(packageName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Tokenizer encoding ids → npm packages that satisfy counting for that encoding.
 * Unknown ids skip validation (callers may use custom counters).
 */
export const TOKENIZER_PEER_PACKAGES: Readonly<
  Record<string, readonly string[]>
> = Object.freeze({
  o200k_base: ['gpt-tokenizer', 'tiktoken'],
  cl100k_base: ['gpt-tokenizer', 'tiktoken'],
  'anthropic-claude': ['@anthropic-ai/tokenizer'],
});

/**
 * @throws {@link TokenizerNotFoundError} When none of the mapped packages resolve.
 */
export function assertTokenizerPeersAvailable(tokenizerName: string): void {
  const peers = TOKENIZER_PEER_PACKAGES[tokenizerName];
  if (peers === undefined || peers.length === 0) {
    return;
  }
  const ok = peers.some((p) => tryResolveNpmPackage(p));
  if (!ok) {
    throw new TokenizerNotFoundError(
      `Tokenizer "${tokenizerName}" requires an installed peer: ${peers.join(' or ')}`,
      { context: { tokenizerName, packages: [...peers] } },
    );
  }
}
