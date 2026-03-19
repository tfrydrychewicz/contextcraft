/**
 * §17.5 / §2.5 — compare batch vs repeated `count()` (tiktoken reuses pooled encoding in `countBatch`).
 */

import { bench, describe, afterEach } from 'vitest';

import { Cl100kTokenizer, freeTiktokenEncodings } from './index.js';

afterEach(() => {
  freeTiktokenEncodings();
});

const SAMPLE = Array.from(
  { length: 200 },
  (_, i) => `msg-${i} ` + 'token '.repeat(15),
);

describe('countBatch vs individual count (Cl100k)', () => {
  const tokenizer = new Cl100kTokenizer();

  bench('individual count() × 200', () => {
    for (const s of SAMPLE) {
      tokenizer.count(s);
    }
  });

  bench('countBatch(200 strings)', () => {
    tokenizer.countBatch(SAMPLE);
  });
});
