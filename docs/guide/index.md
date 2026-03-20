# Guide

Use the guide for tutorials and getting started. For deep dives into the core abstractions, see the [Concepts](/concepts/slots) section. For symbols and types, open the [API reference](/reference/api/README) (generated with TypeDoc at build time).

## Contents

- [Getting started](/guide/getting-started) — install, minimal example, and links to packages.
- [Terminal chatbot tutorial](/guide/build-a-chatbot) — fully working interactive chat with context metadata, token budgets, and OpenAI integration.

## Guides

- [End-to-end chatbot](/guides/chatbot) — multi-turn management, overflow, streaming, checkpoints.
- [RAG application](/guides/rag-application) — document slots, deduplication, semantic overflow, citations.
- [Agent with tools](/guides/agent-with-tools) — tool definitions, results, scratchpad, agent loops.
- [Multi-model & providers](/guides/multi-model) — provider formatters, model registry, switching models.
- [Custom plugin](/guides/custom-plugin) — build a plugin with hooks for the build pipeline.
- [Migration from LangChain](/guides/migration-from-langchain) — mapping LangChain memory patterns to slotmux.

## Framework Integration

- [React](/guides/react) — `@slotmux/react` hooks (`useReactiveContextMeta`, etc.) with `useSyncExternalStore`.
- [Vue](/guides/vue) — `reactiveContext` with `computed` / `watch`, composable patterns, provide/inject.
- [Angular](/guides/angular) — injectable service with Angular Signals, `toSignal`, or `async` pipe.

## Observability

- [Events & observability](/guides/events-and-observability) — subscribing to events, building metrics, structured logging.
- [Debug inspector](/guides/debug-inspector) — `@slotmux/debug` browser UI with live slot visualization.
- [OpenTelemetry](/guides/opentelemetry) — `@slotmux/plugin-otel` spans, metrics, and distributed tracing.

## Advanced Features

- [Streaming build](/guides/streaming-build) — progressive slot delivery with `buildStream()`.
- [Reactive context](/guides/reactive-context) — auto-rebuild with signal-shaped refs.
- [Serialization & checkpoints](/guides/serialization-and-checkpoints) — persist snapshots, rollback with checkpoints.
- [Lossless compression](/guides/lossless-compression-locales) — filler removal, locale packs, fuzzy dedupe.
- [Multimodal content](/guides/multimodal-content) — images, token costs, provider formatting.
- [Pinning & ephemeral](/guides/pinning-and-ephemeral) — overflow-resistant and auto-removed content.

## Production

- [Error handling](/guides/error-handling) — error hierarchy, fallback chain, recovery patterns.
- [Performance tuning](/guides/performance-tuning) — lazy tokens, caching, structural sharing.
- [Security & redaction](/guides/security-and-redaction) — PII redaction, prompt injection, checksums.
- [Presets & defaults](/guides/presets-and-defaults) — chat, rag, agent layouts and customization.

## Concepts

- [Slots](/concepts/slots) — named context partitions with budgets, priorities, and roles.
- [Budgets](/concepts/budgets) — fixed, percent, flex, and bounded-flex token allocation.
- [Overflow](/concepts/overflow) — eight strategies for when content exceeds its budget.
- [Compression](/concepts/compression) — progressive, semantic, and lossless compression.
- [Snapshots](/concepts/snapshots) — immutable build results with metadata, diffing, and serialization.
- [Events](/concepts/events) — the 10-event observability system with redaction.
- [Plugins](/concepts/plugins) — lifecycle hooks, PluginContext, and extension patterns.
- [Providers](/concepts/providers) — adapters, auto-detection, model registry, and formatters.
- [Token counting](/concepts/token-counting) — tokenizers, caching, overhead, and lazy counting.
- [Presets](/concepts/presets) — chat, rag, and agent slot layouts with customization.
