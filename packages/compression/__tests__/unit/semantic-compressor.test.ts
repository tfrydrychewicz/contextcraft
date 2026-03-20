import { describe, expect, it } from 'vitest';

import { cosineSimilarity, runSemanticCompress } from '../../src/semantic-compressor.js';
import type { SemanticScorableItem } from '../../src/semantic-types.js';

const v = {
  anchor: [1, 0, 0] as number[],
  near: [0.99, 0.01, 0] as number[],
  ortho: [0, 1, 0] as number[],
};

function item(
  id: string,
  text: string,
  at: number,
  pinned?: boolean,
): SemanticScorableItem {
  return { id, role: 'user', text, createdAt: at, pinned };
}

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it('returns 0 for empty or length mismatch', () => {
    expect(cosineSimilarity([], [1])).toBe(0);
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
  });
});

describe('runSemanticCompress', () => {
  it('keeps pinned and picks highest-similarity items within budget', async () => {
    const embed = async (text: string) => {
      if (text === 'anchor') return [...v.anchor];
      if (text === 'a') return [...v.near];
      if (text === 'b') return [...v.ortho];
      if (text === 'c') return [...v.near];
      return [0, 0, 0];
    };

    const items = [
      item('a', 'a', 100),
      item('b', 'b', 200),
      item('c', 'c', 300, true),
    ];

    const out = await runSemanticCompress({
      items,
      budgetTokens: 25,
      embed,
      anchorText: 'anchor',
      countItemTokens: (i) => (i.id === 'c' ? 10 : 10),
    });

    expect(out.map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('re-sorts selected items by createdAt', async () => {
    const embed = async (text: string) => {
      if (text === 'x') return [1, 0, 0];
      if (text === 'y') return [0.5, 0.5, 0];
      return [0, 0, 1];
    };

    const items = [
      item('late', 'x', 300),
      item('mid', 'y', 200),
      item('early', 'x', 100),
    ];

    const out = await runSemanticCompress({
      items,
      budgetTokens: 100,
      embed,
      anchorText: 'x',
      countItemTokens: () => 10,
    });

    expect(out.map((x) => x.id)).toEqual(['early', 'mid', 'late']);
  });

  it('filters non-pinned by similarityThreshold', async () => {
    const embed = async (text: string) => {
      if (text === 'anchor') return [1, 0, 0];
      if (text === 'close') return [0.95, 0.05, 0];
      if (text === 'far') return [0, 1, 0];
      return [0, 0, 0];
    };

    const items = [item('close', 'close', 1), item('far', 'far', 2)];

    const out = await runSemanticCompress({
      items,
      budgetTokens: 100,
      embed,
      anchorText: 'anchor',
      similarityThreshold: 0.9,
      countItemTokens: () => 5,
    });

    expect(out.map((x) => x.id)).toEqual(['close']);
  });
});
