/**
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { percentile, summarizeLatenciesMs } from '../benchmarks/latency-stats.js';

describe('latency-stats', () => {
  it('percentile interpolates', () => {
    const s = [10, 20, 30, 40, 50];
    expect(percentile(s, 0)).toBe(10);
    expect(percentile(s, 100)).toBe(50);
    expect(percentile(s, 50)).toBe(30);
  });

  it('summarizeLatenciesMs computes mean and p50/p99', () => {
    const ms = [1, 2, 3, 4, 100];
    const out = summarizeLatenciesMs(ms);
    expect(out.count).toBe(5);
    expect(out.meanMs).toBe(22);
    expect(out.p50Ms).toBe(3);
    expect(out.minMs).toBe(1);
    expect(out.maxMs).toBe(100);
    expect(out.p99Ms).toBeGreaterThanOrEqual(80);
  });
});
