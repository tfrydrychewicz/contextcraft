# Overflow

When a slot's content exceeds its token budget, the **overflow engine** kicks in. Each slot can declare its own overflow strategy, and slotmux provides eight built-in strategies plus support for custom functions.

## When overflow runs

Overflow is part of the `build()` pipeline:

```
ctx.build()
  → plugin hooks (beforeBudgetResolve)
  → budget allocation
  → plugin hooks (beforeOverflow)
  → overflow engine          ← here
  → plugin hooks (afterOverflow)
  → compile messages
  → snapshot
```

For each slot, the engine compares `countTokens(content)` against `budgetTokens`. If the content fits, nothing happens. If it exceeds the budget, the slot's overflow strategy runs.

Slots are processed in **priority-ascending** order — the least important slots are trimmed first.

## Built-in strategies

### `truncate`

Removes items from the **beginning** (oldest first / FIFO) until the content fits within budget. Pinned items are skipped.

```typescript
overflow: 'truncate'
```

This is the **default** when no overflow strategy is specified.

### `truncate-latest`

Removes items from the **end** (newest first / LIFO) until the content fits. Pinned items are skipped.

```typescript
overflow: 'truncate-latest'
```

### `sliding-window`

Keeps all pinned items plus the last `windowSize` non-pinned items. If the result still exceeds the budget, falls back to FIFO truncation on the kept items.

```typescript
overflow: 'sliding-window',
overflowConfig: {
  windowSize: 20,   // default: 10
}
```

### `summarize`

Compresses older content using a summarization function. Supports three modes via `overflowConfig.summarizer`:

- `'builtin:progressive'` (default) — Layer-based progressive summarization.
- `'builtin:map-reduce'` — Splits content into chunks, summarizes each, then merges.
- A custom `SummarizerFn` — Your own async function.

```typescript
overflow: 'summarize',
overflowConfig: {
  summarizer: 'builtin:progressive',
  preserveLastN: 5,
}
```

::: warning
The `summarize` strategy requires a `progressiveSummarize` implementation to be injected (via engine options or the `@slotmux/compression` package). Without it, the build will throw an `InvalidConfigError`.
:::

### `semantic`

Uses embedding similarity to keep the most relevant items. Requires an `embedFn` in `overflowConfig` and an anchor point to score against.

```typescript
overflow: 'semantic',
overflowConfig: {
  embedFn: async (text) => embeddings.create(text),
  anchorTo: 'lastUserMessage',   // or 'systemPrompt', a string, or a ContentItem
  similarityThreshold: 0.7,
}
```

Items below the similarity threshold are dropped first. Among remaining items, the least similar are evicted until the slot fits within budget.

### `compress`

Applies lossless text compression (stop-word removal, whitespace normalization) via `@slotmux/compression`'s `LosslessCompressor`. The meaning is preserved while reducing token count.

```typescript
overflow: 'compress',
overflowConfig: {
  losslessLocale: 'en',
}
```

### `error`

Throws a `ContextOverflowError` if content exceeds the budget. Use this for slots that must never be truncated (e.g. system prompts).

```typescript
overflow: 'error'
```

### `fallback-chain`

Tries strategies in sequence: **summarize → compress → truncate**. If summarize or compress fails (non-fatal), the chain moves to the next strategy. If the content still doesn't fit after truncation, it throws an error.

```typescript
overflow: 'fallback-chain'
```

## Custom strategies

Set `overflow` to a function for full control:

```typescript
overflow: async (context) => {
  const { items, budgetTokens, countTokens } = context;
  // Return a filtered/transformed array of items
  // that fits within budgetTokens
  return items.filter((item) => !item.metadata?.lowPriority);
}
```

The function receives the slot's current items, budget, and a token-counting function, and must return items that fit.

## Protected slots

Mark a slot as `protected: true` to exempt it from all overflow. If a protected slot exceeds its budget, a `SLOT_PROTECTED_OVER_BUDGET` warning is emitted instead of evicting content. Use sparingly — a protected slot that consistently overflows will squeeze the remaining slots.

## Global escalation

After processing all slots individually, the engine checks if the **total** token count across all slots exceeds `totalBudget`. If it does, it enters **escalation mode**:

1. Find the lowest-priority non-protected slot that still has evictable (non-pinned) items.
2. Fully evict all non-pinned content from that slot.
3. Recheck the total. Repeat if still over budget.

This ensures the combined output always fits the model's context window, even when individual slot budgets sum correctly but rounding or token estimation causes a slight overshoot.

## Events

The overflow engine emits events that you can observe via `config.onEvent` or plugins:

| Event | When |
| --- | --- |
| `compression:start` | A compression-like strategy (`summarize`, `compress`, `semantic`) begins. |
| `compression:complete` | The strategy finishes, with before/after token counts. |
| `slot:overflow` | After a slot's overflow strategy has run. |
| `content:evicted` | For each individual item removed during overflow. |

## Next

- [Compression](./compression) — deep dive into the compression strategies.
- [Budgets](./budgets) — how token budgets are allocated.
- [Snapshots](./snapshots) — the immutable build result.
