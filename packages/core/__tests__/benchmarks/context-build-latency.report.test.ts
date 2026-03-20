/**
 * Explicit `Context.build()` latency report (p50 / p99 / mean). Run:
 * `pnpm bench:latency-report` (repo root).
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import {
  formatBenchmarkLatencyTable,
  runBenchmarkLatencySuite,
} from './benchmark-latency-report.js';

describe('Context.build() latency report (§17.5)', () => {
  it('prints p50 / p99 / mean (ms) per scenario', async () => {
    const samples = Number(process.env['BENCH_LATENCY_SAMPLES'] ?? '20');
    const warmup = Number(process.env['BENCH_LATENCY_WARMUP'] ?? '3');
    const rows = await runBenchmarkLatencySuite({ warmup, samples });
    const table = formatBenchmarkLatencyTable(rows);
    console.log(
      `\nContext.build() latency (warmup=${warmup}, samples=${samples})\n${table}\n`,
    );
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r.count).toBe(samples);
      expect(r.meanMs).toBeGreaterThan(0);
      expect(r.p50Ms).toBeGreaterThan(0);
      expect(r.p99Ms).toBeGreaterThan(0);
    }
  }, 900_000);
});
