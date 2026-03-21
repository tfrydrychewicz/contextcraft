# LongMemEval Benchmark

Measures how well slotmux's overflow strategies preserve answerable information when compressing long chat histories to constrained token budgets.

Based on the [LongMemEval](https://github.com/xiaowu0162/LongMemEval) benchmark (ICLR 2025) which tests five core long-term memory abilities: information extraction, multi-session reasoning, knowledge updates, temporal reasoning, and abstention.

**Local only** — not run in CI.

## Quick start

```bash
# 1. Download the dataset (~25 MB)
pnpm bench:longmemeval:download

# 2. Run the benchmark (requires OPENAI_API_KEY)
OPENAI_API_KEY=sk-... pnpm bench:longmemeval

# 3. Evaluate answers with LLM-as-judge
OPENAI_API_KEY=sk-... pnpm bench:longmemeval:evaluate

# 4. Generate the report
pnpm bench:longmemeval:report
```

For a quick smoke test, limit to 5 questions:

```bash
OPENAI_API_KEY=sk-... LONGMEM_MAX_QUESTIONS=5 pnpm bench:longmemeval
```

## Tracing a single question

To see **step-by-step** how the slotmux context evolves as sessions are ingested for a specific question:

```bash
# Trace question "e47becba" with truncate strategy at 8192 budget
pnpm bench:longmemeval:trace e47becba truncate 8192

# Default: truncate at 8192
pnpm bench:longmemeval:trace e47becba

# With summarize (needs OPENAI_API_KEY)
OPENAI_API_KEY=sk-... pnpm bench:longmemeval:trace e47becba summarize 16384
```

This produces a JSONL file at `results/trace-<id>-<strategy>-<budget>.jsonl`. The first line is a header with question metadata. Each subsequent line is one step (one session ingested), containing:

- **`messages`** — the full built context (every message the LLM would see at that point)
- Token counts (total, per-slot), utilization, item counts
- When overflow first triggered, how many items were evicted/compressed
- Build time per step, warnings

Useful for understanding why a particular question was answered correctly (or not) — you can see exactly what the context looked like at each point and when information was lost.

### Analyzing a trace

To produce a detailed analysis report from a trace file:

```bash
pnpm bench:longmemeval:analyze results/trace-1e043500-summarize-16384.jsonl
```

This cross-references the trace with the original dataset to generate a markdown report covering:

- **Answer retention** — did the answer-bearing content survive overflow? At which step was it lost?
- **Compression efficiency** — utilization, wasted budget, compression aggressiveness
- **Performance** — build times, overflow frequency
- **Final context snapshot** — what messages the LLM actually sees
- **Improvement recommendations** — strategy-specific suggestions for slotmux

## What it does

For each combination of (overflow strategy, token budget, question):

1. Creates a slotmux `Context` with the given overflow strategy and budget.
2. Feeds the full LongMemEval chat history (~40 sessions, ~115K tokens) into the context.
3. Appends the evaluation question.
4. Calls `ctx.build()` — budget allocation, overflow, compression.
5. Sends the compressed context to an LLM and records the answer.
6. An LLM judge evaluates correctness against the expected answer.

## Benchmark matrix

| Dimension | Values |
|-----------|--------|
| **Strategies** | `truncate`, `truncate-latest`, `sliding-window`, `summarize`, `fallback-chain` |
| **Budgets** | 4,096 / 8,192 / 16,384 / 32,768 tokens |
| **Questions** | 500 (configurable) |

Full run = 5 strategies x 4 budgets x 500 questions = 10,000 context builds + 10,000 QA calls + 10,000 judge calls.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | (required) | API key for compression, QA, and evaluation |
| `LONGMEM_READER_MODEL` | `gpt-4o-mini` | Model that answers questions from compressed context |
| `LONGMEM_JUDGE_MODEL` | `gpt-4o-mini` | Model for LLM-as-judge evaluation |
| `LONGMEM_COMPRESSION_MODEL` | `gpt-4o-mini` | Model used by the `summarize` overflow strategy |
| `LONGMEM_BUDGETS` | `4096,8192,16384,32768` | Comma-separated budget sizes to test |
| `LONGMEM_STRATEGIES` | `truncate,truncate-latest,sliding-window,summarize,fallback-chain` | Strategies to test |
| `LONGMEM_MAX_QUESTIONS` | `500` | Max questions to process (use `5` for smoke tests) |
| `LONGMEM_RUN_ID` | `<timestamp>` | Run identifier; auto-generated if omitted |

## Output

Results are written to `benchmarks/longmemeval/results/`:

- `<run-id>.jsonl` — raw benchmark results (one JSON per line)
- `<run-id>.evaluated.jsonl` — results with judge verdicts
- `<run-id>-report.md` — markdown report with accuracy tables

All result files are gitignored.

## Resumability

Both the runner and evaluator are resumable. If interrupted, re-run the same command and it will skip already-completed entries. Use the same `LONGMEM_RUN_ID` to continue a previous run.

## Pipeline

The three steps are independent scripts so you can:

- Re-evaluate with a different judge model without re-running the benchmark.
- Re-generate the report without re-evaluating.
- Run the benchmark across multiple sessions (resumable JSONL).

## Dataset

Uses **LongMemEval_S** (cleaned) — 500 questions, each with ~40 chat history sessions totaling ~115K tokens. Downloaded from [HuggingFace](https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned).

## Cost estimate

A full run (500 questions x 5 strategies x 4 budgets) with `gpt-4o-mini` makes ~30,000 API calls. At ~$0.15/1M input tokens and ~$0.60/1M output tokens, expect roughly $5-15 USD depending on context sizes and response lengths.
