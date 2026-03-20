/**
 * Measure repeated `Context.build()` with p50 / p99 / mean (§17.5).
 *
 * @packageDocumentation
 */

import { summarizeLatenciesMs, type LatencySummaryMs } from './latency-stats.js';
import {
  ALL_BENCHMARK_SCENARIO_IDS,
  BENCHMARK_SCENARIO_META,
  createContextForScenario,
  type BenchmarkScenarioId,
} from './scenario-builds.js';

export type BenchmarkLatencyRow = LatencySummaryMs & {
  readonly id: BenchmarkScenarioId;
  readonly title: string;
  readonly spec: string;
};

export type RunBenchmarkLatencyOptions = {
  /** Iterations before sampling (default 3). */
  readonly warmup?: number;
  /** Timed iterations per scenario (default 30). */
  readonly samples?: number;
};

/**
 * Runs all packaged benchmark scenarios: warmup, then collects `samples` build durations per scenario.
 */
export async function runBenchmarkLatencySuite(
  options: RunBenchmarkLatencyOptions = {},
): Promise<BenchmarkLatencyRow[]> {
  const warmup = options.warmup ?? 3;
  const samples = options.samples ?? 30;
  const rows: BenchmarkLatencyRow[] = [];

  for (const id of ALL_BENCHMARK_SCENARIO_IDS) {
    const ctx = createContextForScenario(id);
    const meta = BENCHMARK_SCENARIO_META[id];

    for (let w = 0; w < warmup; w++) {
      await ctx.build();
    }

    const timings: number[] = [];
    for (let s = 0; s < samples; s++) {
      const t0 = performance.now();
      await ctx.build();
      timings.push(performance.now() - t0);
    }

    const summary = summarizeLatenciesMs(timings);
    rows.push({
      id,
      title: meta.title,
      spec: meta.spec,
      ...summary,
    });
  }

  return rows;
}

/** ASCII table for console / CI logs. */
export function formatBenchmarkLatencyTable(rows: readonly BenchmarkLatencyRow[]): string {
  const headers = ['scenario', 'spec', 'mean_ms', 'p50_ms', 'p99_ms', 'min_ms', 'max_ms', 'n'];
  const lines = [headers.join('\t')];
  for (const r of rows) {
    lines.push(
      [
        r.title,
        r.spec,
        r.meanMs.toFixed(3),
        r.p50Ms.toFixed(3),
        r.p99Ms.toFixed(3),
        r.minMs.toFixed(3),
        r.maxMs.toFixed(3),
        String(r.count),
      ].join('\t'),
    );
  }
  return lines.join('\n');
}
