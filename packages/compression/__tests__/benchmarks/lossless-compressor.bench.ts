import { bench, describe } from 'vitest';

import { LosslessCompressor } from '../../src/index.js';

const verboseChat = Array.from({ length: 40 }, (_, i) =>
  [
    `Well, you know, so basically user message ${i} with   extra   spaces.`,
    'Thanks!',
    `For example, assistant reply ${i}. That is all.`,
    "You're welcome!",
  ].join('\n'),
).join('\n\n');

describe('LosslessCompressor benchmark', () => {
  bench('compressText — verbose synthetic chat', () => {
    const c = new LosslessCompressor();
    c.compressText(verboseChat);
  });
});
