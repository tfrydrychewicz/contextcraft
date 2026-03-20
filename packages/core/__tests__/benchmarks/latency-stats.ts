/**
 * Latency aggregation for benchmark reports (p50 / p99 / mean).
 *
 * @packageDocumentation
 */

/** Linear interpolation percentile on sorted samples (0–100). */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) {
    return Number.NaN;
  }
  const clamped = Math.min(100, Math.max(0, p));
  const idx = (clamped / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) {
    return sorted[lo]!;
  }
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

export type LatencySummaryMs = {
  readonly meanMs: number;
  readonly p50Ms: number;
  readonly p99Ms: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly count: number;
};

export function summarizeLatenciesMs(samplesMs: readonly number[]): LatencySummaryMs {
  if (samplesMs.length === 0) {
    return {
      meanMs: Number.NaN,
      p50Ms: Number.NaN,
      p99Ms: Number.NaN,
      minMs: Number.NaN,
      maxMs: Number.NaN,
      count: 0,
    };
  }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const sum = samplesMs.reduce((a, b) => a + b, 0);
  return {
    meanMs: sum / samplesMs.length,
    p50Ms: percentile(sorted, 50),
    p99Ms: percentile(sorted, 99),
    minMs: sorted[0]!,
    maxMs: sorted[sorted.length - 1]!,
    count: samplesMs.length,
  };
}
