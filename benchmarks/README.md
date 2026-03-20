# Benchmark baseline (§2.6 / §17.5)

- **Generate / refresh** (after intentional perf changes):

  ```bash
  pnpm test:bench:baseline
  ```

- **CI** (`.github/workflows/benchmark.yml`) runs `vitest bench --compare benchmarks/baseline.json` so runs show deltas vs this file.

- `filepath` entries inside `baseline.json` are machine-specific; Vitest matches benchmarks by internal task id. If compare ever mis-aligns on a new runner, re-run the command above and commit the updated JSON.

## Context build benchmark suite (§17.5, §18.1)

Vitest **bench** tasks (for baseline compare) live in `packages/core/__tests__/benchmarks/context-scenarios.bench.ts`:

- `small-chat` — 50 messages, 2 slots
- `large-rag` — 500 chunks, 5 slots
- `agent-loop` — 200 tool messages, 4 slots
- `stress-test` — 10_000 messages, 10 slots

**p50 / p99 / mean report** (separate from TinyBench; times only `Context.build()` after warmup):

```bash
pnpm bench:latency-report
```

Optional env: `BENCH_LATENCY_WARMUP` (default `3`), `BENCH_LATENCY_SAMPLES` (default `20`).

Uses `packages/core/vitest.benchmark-report.config.ts` so the report file is not part of the default workspace test glob (keeps `pnpm test` fast).

**Vitest bench note:** `beforeAll` does not run before TinyBench iterations; scenario benches use one context per scenario created at module load so each sample times only `Context.build()`.
