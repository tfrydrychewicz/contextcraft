# Token counting

Token counting is the foundation of slotmux's budget system. Every slot budget, overflow decision, and utilization metric depends on accurate token counts. Slotmux counts tokens using the same tokenizers the LLM providers use, caches results aggressively, and accounts for provider-specific structural overhead.

## Why accuracy matters

If token counts are off, one of two things happens:

- **Undercount** — your prompt exceeds the model's context window and the API returns an error.
- **Overcount** — you leave tokens on the table, losing context that could improve the response.

Slotmux targets the same accuracy as the provider's billing. Off-by-one is acceptable; off-by-100 is not.

## The Tokenizer interface

All tokenizers implement a common interface:

```typescript
interface Tokenizer {
  readonly id: string;

  count(text: string): TokenCount;
  countBatch(texts: readonly string[]): TokenCount[];
  countMessage(message: CompiledMessage): TokenCount;
  countMessages(messages: CompiledMessage[]): TokenCount;
  encode(text: string): number[];
  decode(tokens: number[]): string;
  truncateToFit(text: string, maxTokens: number): string;
}
```

| Method | Purpose |
| --- | --- |
| `count` | Count tokens in a string. |
| `countBatch` | Count multiple strings in one call (reuses encoder state for performance). |
| `countMessage` | Count a full message including role overhead. |
| `countMessages` | Count a message array including conversation overhead. |
| `encode` / `decode` | Convert between text and token IDs. |
| `truncateToFit` | Truncate text to fit within a token budget. |

## Available tokenizers

| Tokenizer | Models | Peer dependency |
| --- | --- | --- |
| `Cl100kTokenizer` | GPT-4, GPT-4-turbo | `tiktoken` or `gpt-tokenizer` |
| `O200kTokenizer` | GPT-4o, o1, o3, GPT-5.4 | `tiktoken` or `gpt-tokenizer` |
| `ClaudeTokenizer` | Claude 3.5, 4, 4.5, 4.6 | `@anthropic-ai/tokenizer` |
| `SentencePieceTokenizer` | Gemini, Mistral | (built-in approximation) |
| `CharEstimatorTokenizer` | Any (fallback) | None |
| `FallbackTokenizer` | Any | None — wraps `CharEstimatorTokenizer` |

### Character estimator

The `CharEstimatorTokenizer` uses a simple heuristic: **4 characters ≈ 1 token**. It requires no dependencies and is useful for:

- Quick prototyping before installing a real tokenizer.
- Non-critical paths where approximate counts are acceptable.
- Browser environments where WASM tokenizers aren't available.

### Fallback behavior

When a model requires a tokenizer whose peer dependency isn't installed, slotmux can either:

- **Throw** `TokenizerNotFoundError` (default with `strictTokenizerPeers: true`).
- **Fall back** to `CharEstimatorTokenizer` (with `strictTokenizerPeers: false`).

```typescript
createContext({
  model: 'gpt-4o',
  strictTokenizerPeers: false,  // fall back to char estimation if gpt-tokenizer is missing
});
```

## Peer dependency model

Tokenizer packages are **peer dependencies**, not bundled with slotmux. You install only what your models need:

```bash
pnpm add gpt-tokenizer          # OpenAI models (cl100k, o200k)
pnpm add @anthropic-ai/tokenizer # Claude models
```

This keeps slotmux's install size small. A chatbot using only GPT-4o doesn't need Anthropic's tokenizer.

When a required peer is missing, slotmux throws a `TokenizerNotFoundError` with a message telling you exactly what to install:

```
TokenizerNotFoundError: Tokenizer "o200k_base" requires peer dependency "gpt-tokenizer".
Install it: pnpm add gpt-tokenizer
```

## Token count cache

Counting tokens is expensive — BPE encoding involves dictionary lookups and regex splitting. Slotmux caches results in a two-tier cache:

```
L1: LRU cache (10 000 entries, sub-microsecond lookup)
L2: Map (unbounded, survives across builds)
```

### How it works

1. **Cache key** — `SHA-256(tokenizer.id + content)`.
2. **L1 hit** — return immediately (hot path).
3. **L2 hit** — promote to L1, return.
4. **Miss** — count with the tokenizer, store in both L1 and L2, return.

Since content items are immutable once created, cache entries never need invalidation. The only way to clear the cache is `cache.reset()`.

### Metrics

The cache tracks hit/miss statistics:

```typescript
const metrics = cache.getMetrics();
// → { l1Hits: 1523, l2Hits: 42, misses: 200 }
```

## Lazy token counting

By default, slotmux counts tokens **lazily** — the `tokens` field on a `ContentItem` is computed on first access via a Proxy pattern, then cached:

```typescript
createContext({
  model: 'gpt-4o',
  lazyContentItemTokens: true,  // default
});
```

This means:

- Pushing 1 000 messages doesn't trigger 1 000 token counts immediately.
- Tokens are counted when the build pipeline needs them (during budget resolution and overflow).
- Subsequent accesses read the cached value.

Disable lazy counting with `lazyContentItemTokens: false` if you want tokens computed eagerly on insertion.

## Provider overhead

Token counts include structural overhead that providers add on top of your content. Each provider charges differently for role delimiters, conversation framing, and the `name` field:

| Provider | Per message | Per conversation | Per name |
| --- | --- | --- | --- |
| OpenAI | 4 tokens | 2 tokens | 1 token |
| Anthropic | 3 tokens | 1 token | 0 |
| Google | 4 tokens | 2 tokens | 0 |
| Mistral | 4 tokens | 2 tokens | 1 token |
| Ollama | 4 tokens | 2 tokens | 1 token |

The `countMessages()` method on each tokenizer accounts for these automatically. Budget resolution uses `countMessages()` so your budgets reflect what the provider actually charges.

## Batch counting

`countBatch()` processes multiple strings in a single call. Implementations reuse encoder state across strings, which is faster than counting individually in a loop:

```typescript
const counts = tokenizer.countBatch(['Hello world', 'How are you?', 'Goodbye']);
// → [TokenCount(2), TokenCount(4), TokenCount(1)]
```

The build pipeline uses batch counting internally when filling lazy token values for a slot's items.

## Authoritative token counts

For security-sensitive applications, enable `requireAuthoritativeTokenCounts`:

```typescript
createContext({
  model: 'gpt-4o',
  requireAuthoritativeTokenCounts: true,
});
```

This ensures `build()` and `buildStream()` throw if the token accountant is missing — preventing fallback to character estimation for totals. Use this when token count accuracy is critical for billing or safety.

## Custom token accountant

You can supply a custom token counting function via `tokenAccountant`:

```typescript
createContext({
  model: 'gpt-4o',
  tokenAccountant: {
    countItems: (items) =>
      items.reduce((total, item) =>
        total + (typeof item.content === 'string' ? item.content.length / 4 : 0),
      0),
  },
});
```

This is useful in testing or when you have a specialized counting strategy.

## Next

- [Providers](./providers) — which tokenizer is used for which model.
- [Budgets](./budgets) — how token counts feed into budget resolution.
- [Overflow](./overflow) — what happens when counted tokens exceed the budget.
