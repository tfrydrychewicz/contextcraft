# Streaming Build

Demonstrates `ctx.buildStream()` which emits `slot:ready` events as each slot is compiled, allowing real-time progress updates.

## Setup

```bash
npm install
```

No API key required — this example runs locally without calling any LLM.

## Run

```bash
npm start
```

## What it demonstrates

- `buildStream()` instead of `build()` for incremental slot compilation
- `slot:ready` events emitted per slot with compiled messages
- `complete` event with the final snapshot
- Custom slot layout with fixed, percent, and flex budgets
- Sliding window overflow on the history slot
- Per-slot token breakdown from snapshot metadata
