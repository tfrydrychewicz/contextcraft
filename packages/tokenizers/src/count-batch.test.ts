import { describe, expect, it, afterEach } from 'vitest';

import {
  CharEstimatorTokenizer,
  Cl100kTokenizer,
  ClaudeTokenizer,
  FallbackTokenizer,
  SentencePieceTokenizer,
  freeTiktokenEncodings,
} from './index.js';

afterEach(() => {
  freeTiktokenEncodings();
});

function expectBatchMatchesIndividual(
  tokenizer: {
    count: (s: string) => unknown;
    countBatch: (texts: readonly string[]) => unknown[];
  },
  texts: string[],
): void {
  const batch = tokenizer.countBatch(texts);
  expect(batch).toHaveLength(texts.length);
  for (const [i, s] of texts.entries()) {
    expect(batch[i]).toEqual(tokenizer.count(s));
  }
}

describe('Tokenizer.countBatch (§2.5)', () => {
  it('returns empty array for empty input', () => {
    const t = new CharEstimatorTokenizer();
    expect(t.countBatch([])).toEqual([]);
  });

  it('CharEstimatorTokenizer matches per-string count', () => {
    const t = new CharEstimatorTokenizer();
    const texts = ['', 'a', 'hello world', 'x'.repeat(12)];
    expectBatchMatchesIndividual(t, texts);
  });

  it('Cl100kTokenizer matches per-string count', () => {
    const t = new Cl100kTokenizer();
    const texts = ['hello world', 'function foo() {}', ''];
    expectBatchMatchesIndividual(t, texts);
  });

  it('ClaudeTokenizer matches per-string count', () => {
    const t = new ClaudeTokenizer();
    const texts = ['hello world', 'café'];
    expectBatchMatchesIndividual(t, texts);
  });

  it('SentencePieceTokenizer (gpt-tokenizer) matches per-string count', () => {
    const t = new SentencePieceTokenizer('cl100k_base');
    const texts = ['hello world', 'alpha beta'];
    expectBatchMatchesIndividual(t, texts);
  });

  it('FallbackTokenizer delegates countBatch to primary', () => {
    const fb = new FallbackTokenizer(() => new Cl100kTokenizer());
    const texts = ['a', 'b', 'c'];
    expectBatchMatchesIndividual(fb, texts);
  });

  it('FallbackTokenizer delegates countBatch to char fallback', () => {
    const fb = new FallbackTokenizer(() => {
      throw new Error('no wasm');
    });
    const texts = ['hi', 'there'];
    expectBatchMatchesIndividual(fb, texts);
  });

  it('Cl100k preserves order for heterogeneous lengths', () => {
    const t = new Cl100kTokenizer();
    const texts = ['x', 'xx', 'xxx', 'short', 'a longer piece of prose here'];
    expect(t.countBatch(texts)).toEqual(texts.map((s) => t.count(s)));
  });
});
