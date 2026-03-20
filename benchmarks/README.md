# Benchmark baseline (§2.6 / §17.5)

- **Generate / refresh** (after intentional perf changes):

  ```bash
  pnpm test:bench:baseline
  ```

- **Local CI parity** (same flow as GitHub Actions, writes `benchmarks/current.json` + `benchmark-report.md`):

  ```bash
  pnpm build && pnpm bench:ci
  ```

- **CI** (`.github/workflows/benchmark.yml`, Phase 14.4):

  1. Runs `vitest bench --outputJson benchmarks/current.json` after `pnpm build`.
  2. `scripts/bench-ci-report.mjs` compares `benchmarks/current.json` to **`benchmarks/baseline.json`** (matched by Vitest group `fullName` + benchmark `name`), writes **`benchmark-report.md`**, and prints regressions where **current mean > baseline mean × `BENCH_ALERT_THRESHOLD`** (default **1.2** = 120%).
  3. Uploads **`benchmark-results-<run_id>`** artifact (`current.json` + report) with **90-day retention** for historical / trend review (download from the Actions run).
  4. On **same-repo** pull requests, posts a **sticky comment** with the markdown table (`marocchino/sticky-pull-request-comment`).
  5. **Strict gate:** set `BENCH_FAIL_ON_ALERT: 'true'` in the workflow **after** refreshing the baseline on **`ubuntu-latest` + Node 22** so means match CI; otherwise leave `'false'` (alerts only in logs + PR comment).

- `filepath` entries inside `baseline.json` are machine-specific; the CI script matches by **`fullName` + benchmark `name`**, not path. Refresh baseline when benchmark names change.

- `benchmarks/current.json` and `benchmark-report.md` are gitignored.

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
