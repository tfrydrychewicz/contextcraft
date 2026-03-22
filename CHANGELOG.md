# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file is managed by [Changesets](https://github.com/changesets/changesets). Package-specific changelogs are generated when publishing.

## 1.0.0-rc.5 — 2026-03-22

### Added

#### `@slotmux/tokenizers`

- **FNV-1a cache keys** — Token count cache now uses FNV-1a (pure JS, non-cryptographic) instead of SHA-256 for cache key hashing, removing the `node:crypto` dependency and improving key computation speed.

#### `@slotmux/compression`

- **Adaptive similarity thresholds** — `computeAdaptiveThreshold` uses a z-score formula (`mean + k × stddev`) to set a data-driven similarity cutoff for semantic compression. Configure via `adaptiveThreshold: true` (k=1.0) or `adaptiveThreshold: 2.5` for custom sensitivity.
- **Tiered token estimation** — `estimateItemsTokens` provides fast character-based token estimates (chars/3.5) for heuristic paths like `computeDynamicPreserveLastN` and adaptive zone skip, while exact BPE counting is reserved for final budget enforcement.
- **JSON structured fact extraction** — `createDefaultExtractFacts` now uses `responseSchema` with `FACT_EXTRACTION_SCHEMA` for type-safe JSON output from providers that support structured output. Falls back to `FACT:` line parsing when JSON parsing fails.

#### `@slotmux/providers`

- **`responseSchema` support** — All provider factories (`openai`, `anthropic`, `google`, `mistral`, `ollama`) now accept an optional `responseSchema` parameter in `SummarizeTextFn` and use their native structured output mechanisms (OpenAI `response_format: json_schema`, Anthropic tool use, Google `responseMimeType`, Mistral `response_format: json_object`, Ollama `format: json`).

#### `slotmux` (core)

- **`adaptiveThreshold` config** — New `overflowConfig.adaptiveThreshold` option for semantic compression (`boolean | number`).

#### Documentation

- New SVG diagrams: adaptive similarity thresholds and tiered token estimation.
- Expanded compression.md with adaptive threshold configuration examples and tiered estimation overview.
- Updated overflow.md with `adaptiveThreshold` option for the semantic strategy.

#### Benchmarks

- **LLM usage tracking** — LongMemEval benchmark now counts LLM requests and estimated tokens sent per run, prints totals at completion, and includes per-strategy usage tables in the report.

## 1.0.0-rc.4 — 2026-03-21

### Added

#### `@slotmux/compression`

- **Fact-aware compression** — Summarization prompts now use an extraction-first format: the LLM outputs structured `FACT: subject | predicate | value` lines before writing narrative. Facts accumulate in a deduplicated `FactStore` across compression rounds, keyed by `subject|predicate` with highest-confidence wins. A synthetic `Known facts:` item is rendered at the start of the summarized context.
- **Fact pinning in L3 re-compression** — When Layer 3 consolidation runs, existing facts are injected into the prompt as "must preserve" constraints so the model doesn't silently drop them.
- **Dedicated fact extraction hook** — New `ExtractFactsFn` interface and `createDefaultExtractFacts` factory for running a separate LLM-backed fact extraction pass before summarization. Custom regex-based extractors are also supported.
- **Importance-weighted zone partitioning** — Non-recent items are now scored by `computeItemImportance` (entity density, decision/preference language, specific fact indicators) before splitting into OLD and MIDDLE zones. High-value items survive longer. Provide a custom `ImportanceScorerFn` or set `importanceScorer: null` for pure chronological ordering.
- **Incremental summarization** — Items with a `summarizes` field (from a previous compression pass) are carried forward without re-summarization. Only fresh content is sent to the LLM, making per-build cost proportional to new content, not total conversation length.
- **Adaptive zone skip** — After old-zone processing, if the output plus middle-zone and recent items already fits within budget, middle-zone LLM calls are skipped entirely.

#### `@slotmux/providers`

- **Adaptive rate limiter (AIMD)** — All provider factories now coordinate retry across concurrent summarization calls using Additive Increase / Multiplicative Decrease congestion control. On HTTP 429, effective concurrency is halved and pending calls pause for the `Retry-After` duration. On success, concurrency slowly recovers. Retry wait resolves from `Retry-After` header, body text hints, or a 1-second default.
- **Input sanitization** — `sanitizeLLMInput` and `withSanitizedInputs` strip control characters (C0/C1 except tab/newline/CR) and lone surrogates before sending text to providers.

#### `slotmux` (core)

- **`factBudgetTokens` config** — Controls the token budget for the rendered fact block (default: 20% of summary budget, max 512).
- **`importanceScorer` config** — Accepts a custom scoring function, `null` (pure chronological), or omit for the default scorer.
- **`extractFacts` config** — Accepts a custom or LLM-backed fact extraction function wired through `overflowConfig`.

#### Documentation

- Three new SVG diagrams: fact-aware compression architecture, incremental summarization comparison, and importance-weighted zone partitioning.
- Expanded compression.md with scoring signal table, custom `extractFacts` example, and per-feature SVG references.
- Updated overflow.md summarize section with bullet-point overview of all three advanced capabilities.
- Restructured chatbot guide with fact-aware compression section covering configuration, custom extraction, and importance scoring.
- Updated landing page to highlight fact-aware compression and incremental cost stability.

### Fixed

#### `@slotmux/compression`

- **Budget-aware summarization prompts** — Each summarization call now receives a target token count so the LLM fills available space instead of producing a terse paragraph.
- **Dynamic `preserveLastN`** — When omitted, the number of verbatim recent items scales with the slot budget automatically (~50%).
- **Multi-segment summarization** — Large zones are split into segments and summarized independently, preserving more information across the full conversation history.

#### `@slotmux/providers`

- **Removed hard output token caps** — Providers no longer pass `max_completion_tokens` / `maxOutputTokens` to the LLM API. The prompt instruction (`Target output length: ~N words`) guides output length, preventing `finishReason: "length"` empty responses.

## 1.0.0-rc.3 — 2026-03-21

### Fixed

#### `slotmux` (core)

- **`forceCompress` on error-strategy slots** — Fixed `ContextOverflowError` thrown when `forceCompress: true` was used with the `chat` preset. The synthetic 50% budget caused the system slot's `overflow: 'error'` strategy to fire even though content was within its real budget. Error-strategy slots are now skipped when `forceCompress` is active and content is within budget.

## 1.0.0-rc.2 — 2026-03-21

### Added

#### `slotmux` (core)

- **`forceCompress` build override** — `ctx.build({ overrides: { forceCompress: true } })` triggers overflow strategies on all eligible slots even when content is within budget. The engine sets a synthetic reduced budget (50% of current usage) so strategies have a meaningful compression target. Works with both `build()` and `buildStream()`. Protected slots are still respected.
- **`slotmuxProvider` config field** — New `ContextConfig.slotmuxProvider` option that auto-wires LLM capabilities (summarization, embeddings) into the build pipeline. When set, compression strategies like `summarize` work out of the box without manual `progressiveSummarize` injection.

#### `@slotmux/providers`

- **Provider factories** — `openai()`, `anthropic()`, `google()`, `mistral()`, `ollama()` factory functions that return a `SlotmuxProvider` bundling the adapter with auto-wired LLM calls. Pass just an API key for the simplest setup; override `compressionModel`, `baseUrl`, or supply custom `summarize`/`embed` functions for advanced use.
- **`SlotmuxProvider` type** — New type that bundles a `ProviderAdapter` with optional `summarizeText`, `mapReduce`, and `embed` capabilities.

#### Documentation

- Forced compression docs across overflow, compression, streaming-build, and getting-started pages.
- `!compress` command in the chatbot tutorial demonstrating on-demand context compression.
- Provider factories documentation in concepts/providers with progressive disclosure API levels.
- First-party plugin documentation pages (RAG, Memory, Tools) with configuration, behavior, and integration patterns.
- SVG diagrams for overflow strategies, budget types, and compression strategies.

## 1.0.0-rc.1 — 2026-03-20

First release candidate. All packages ship at `1.0.0-rc.1`.

### Added

#### `slotmux` (core)

- **Slots & content store** — Named slots with per-slot budgets, priorities, compile positions, and `maxItems` limits. Content items support text, multimodal (image URL/base64), tool calls, pinning, and ephemeral flags.
- **Token budgets** — Fixed, percent, flex, and bounded-flex allocations resolved top-down by priority with response token reservation. Total never exceeds the context window.
- **8 overflow strategies** — `truncate`, `truncate-latest`, `sliding-window`, `summarize` (progressive and map-reduce), `semantic` (embedding similarity), `compress` (lossless phrase packs), `error`, and `fallback-chain`. Custom strategies via async functions.
- **Immutable snapshots** — Every `build()` returns a frozen `ContextSnapshot` with compiled messages, per-slot metadata, timing, warnings, and utilization stats. SHA-256 checksummed serialization/deserialization with schema migration support.
- **Snapshot diffing** — `snapshot.diff(other)` returns added, removed, modified messages and changed slot metadata.
- **Checkpoints** — Lightweight `checkpoint()` / `restore()` for slot state rollback with delta tracking.
- **Streaming build** — `buildStream()` emits `slot:ready` events per compile-order slot with macrotask yields between slots.
- **Reactive context** — `slotmux/reactive` subpath with signals (`ref`, `computedRef`) and `ReactiveContext` for framework-agnostic reactivity.
- **Plugin system** — `ContextPlugin` interface with 11 lifecycle hooks (`install`, `prepareSlots`, `beforeBudgetResolve`, `afterBudgetResolve`, `beforeOverflow`, `afterOverflow`, `beforeSnapshot`, `afterSnapshot`, `onContentAdded`, `onEvent`, `destroy`). Built-in `sanitizePlugin` for prompt injection detection.
- **Event system** — Typed event emitter with 10 event types (`content:added`, `content:evicted`, `content:pinned`, `slot:overflow`, `slot:budget-resolved`, `compression:start`, `compression:complete`, `build:start`, `build:complete`, `warning`).
- **Logging & redaction** — Structured `Logger` with scoped, contextual, and leveled variants. PII redaction engine for events and log output with configurable patterns.
- **Config validation** — Zod schemas for `ContextConfig`, `SlotConfig`, and slot budgets with `safeParseContextConfig` for non-throwing validation.
- **3 presets** — `chat`, `rag`, and `agent` preset slot layouts via `createContext({ preset })`.
- **Model registry** — 60+ built-in models (OpenAI GPT-4/4.1/5/5.4, o-series, Anthropic Claude 3.x/4.x, Google Gemini, Mistral, Ollama) with prefix matching, custom model registration, and provider inference.
- **Token overhead** — Per-provider structural overhead tables (message/conversation/tool overhead tokens).
- **Security defaults** — `DEFAULT_SLOT_MAX_ITEMS` (10,000), near-limit warnings at 80%, `SLOT_ITEMS_WARN_THRESHOLD_RATIO`.
- **Builder pattern** — `contextBuilder()` fluent API as alternative to `createContext`.

#### `@slotmux/providers`

- **5 provider adapters** — `OpenAIAdapter`, `AnthropicAdapter`, `GoogleAdapter`, `MistralAdapter`, `OllamaAdapter` with factory functions (`createOpenAIAdapter`, etc.).
- **Message formatters** — `formatOpenAIMessages`, `formatAnthropicMessages`, `formatGeminiMessages`, `formatMistralMessages`, `formatOllamaMessages` convert compiled messages to each provider's API shape.
- **Role collapsing** — `collapseConsecutiveRoles` (Anthropic), `collapseConsecutiveGeminiRoles` (Google) for providers that reject consecutive same-role messages.

#### `@slotmux/tokenizers`

- **Tokenizer implementations** — `O200kTokenizer` (GPT-4o/4.1/5), `Cl100kTokenizer` (GPT-4/4-turbo), `ClaudeTokenizer`, `SentencePieceTokenizer`, `CharEstimatorTokenizer` (fallback), `FallbackTokenizer`.
- **Token count cache** — `TokenCountCache` with LRU L1 cache and hit/miss metrics.
- **Message counting** — `countCompiledMessages` with per-message and per-conversation overhead.
- **Encoding management** — `freeTiktokenEncodings` for memory cleanup.

#### `@slotmux/compression`

- **Lossless compression** — `LosslessCompressor` with language packs (English, German, minimal). Phrase replacement, whitespace normalization, stop-word removal. Custom language pack registration.
- **Progressive summarization** — `runProgressiveSummarize` with zone partitioning (hot/warm/cold) and layer-based progressive compression.
- **Map-reduce summarization** — `runMapReduceSummarize` with configurable chunk splitting and merge functions.
- **Semantic compression** — `runSemanticCompress` with cosine similarity scoring against anchor content.

#### `@slotmux/debug`

- **Inspector server** — `attachInspector` starts a local HTTP/WebSocket server with real-time slot visualization.
- **Preact UI** — Browser-based inspector at `/inspector/` with timeline, slot breakdown, and event stream.
- **REST endpoints** — `/health`, `/slots`, `/snapshot`, `/events` for programmatic access.

#### `@slotmux/react`

- **React hooks** — `useReactiveContextMeta`, `useReactiveContextUtilization`, `useReactiveContextBuildError` powered by `useSyncExternalStore`.

#### `@slotmux/plugin-rag`

- **RAG plugin** — `ragPlugin` with automatic slot creation, chunk deduplication (`jaccardSimilarity`), citation tracking, and metadata constants.

#### `@slotmux/plugin-tools`

- **Tools plugin** — `toolsPlugin` with tool definition slot management and auto-truncation of tool results (`truncateStringToApproxTokens`).

#### `@slotmux/plugin-otel`

- **OpenTelemetry plugin** — `otelPlugin` emitting spans (`slotmux.build`, `slotmux.overflow`, `slotmux.compress`) and metrics (build duration, tokens used, utilization).

#### `@slotmux/plugin-memory`

- **Memory plugin** — `memoryPlugin` with `InMemoryMemoryStore` and `SQLiteMemoryStore` backends. Fact extraction, ranked retrieval, and Jaccard similarity.

#### Documentation

- VitePress documentation site with getting started guide, chatbot tutorial, 5 concept pages, 16 guides (framework integration, observability, advanced features, production patterns), and API reference.

