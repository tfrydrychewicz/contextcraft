import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/peer-resolve.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/config/peer-resolve.js')>();
  const { TokenizerNotFoundError } = await import('../../src/errors.js');
  return {
    ...actual,
    tryResolveNpmPackage: (): boolean => false,
    assertTokenizerPeersAvailable(tokenizerName: string): void {
      const peers = actual.TOKENIZER_PEER_PACKAGES[tokenizerName];
      if (peers === undefined || peers.length === 0) {
        return;
      }
      throw new TokenizerNotFoundError(
        `Tokenizer "${tokenizerName}" requires an installed peer: ${peers.join(' or ')}`,
        { context: { tokenizerName, packages: [...peers] } },
      );
    },
  };
});

import { createContext, TokenizerNotFoundError } from '../../src/index.js';

describe('createContext strictTokenizerPeers (peers unavailable)', () => {
  it('throws TokenizerNotFoundError when strictTokenizerPeers is true', () => {
    expect(() =>
      createContext({
        model: 'gpt-4o',
        preset: 'chat',
        strictTokenizerPeers: true,
      }),
    ).toThrow(TokenizerNotFoundError);
  });

  it('does not throw when strictTokenizerPeers is false', () => {
    expect(() =>
      createContext({
        model: 'gpt-4o',
        preset: 'chat',
        strictTokenizerPeers: false,
      }),
    ).not.toThrow();
  });
});
