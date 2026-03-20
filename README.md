<p align="center">
  <img src="docs/public/slotmux.svg" alt="Slotmux logo" width="96" height="96" />
</p>

<p align="center">
  <b>slotmux</b><br/>
  <i>The memory allocator for LLM context windows.</i>
</p>

<p align="center">
  <a href="https://github.com/tfrydrychewicz/slotmux/actions/workflows/ci.yml"><img src="https://github.com/tfrydrychewicz/slotmux/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/slotmux"><img src="https://img.shields.io/npm/v/slotmux.svg" alt="npm version"></a>
  <a href="https://bundlephobia.com/package/slotmux"><img src="https://img.shields.io/badge/core-7%20kB%20gzip-6E9F18" alt="bundle size"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://tfrydrychewicz.github.io/slotmux/"><img src="https://github.com/tfrydrychewicz/slotmux/actions/workflows/docs.yml/badge.svg" alt="Docs"></a>
</p>

---

Your LLM app is a conversation with a budget. System prompts, chat history, retrieved documents, tool outputs — they all compete for the same finite context window. Today you manage that with string concatenation and hope. Slotmux gives you **structure**.

Declare named **slots** with token budgets and priorities. Push content. Call `build()`. Slotmux allocates budgets, counts tokens, handles overflow, and gives you an immutable snapshot with compiled messages ready for any provider — in **7 kB gzipped**.

```typescript
import { createContext, Context } from 'slotmux';
import { formatOpenAIMessages } from '@slotmux/providers';

const { config } = createContext({
  model: 'gpt-5.4-mini',
  preset: 'chat',
  reserveForResponse: 4096,
  lazyContentItemTokens: true,
});

const ctx = Context.fromParsedConfig(config);
ctx.system('You are a helpful assistant.');
ctx.user('What is slotmux?');

const { snapshot } = await ctx.build();
const messages = formatOpenAIMessages(snapshot.messages);

// snapshot.meta → { totalTokens: 19, utilization: 0.02%, buildTimeMs: 2, ... }
```

## Why slotmux

### Slots, not strings

Every piece of context lives in a named **slot** — system prompt, conversation history, retrieved docs, tool results. Each slot has its own token budget, overflow strategy, and compile position. No more guessing whether your prompt fits.

### Token budgets that actually work

Allocate tokens with **fixed**, **percent**, **flex**, or **bounded flex** budgets. Slotmux resolves them top-down by priority, reserves space for the model's response, and guarantees the total never exceeds the context window.

```typescript
createContext({
  model: 'claude-sonnet-4-20250514',
  reserveForResponse: 8192,
  slots: {
    system:  { priority: 100, budget: { fixed: 2000 },   overflow: 'error' },
    docs:    { priority: 80,  budget: { percent: 40 },   overflow: 'semantic' },
    history: { priority: 50,  budget: { flex: true },     overflow: 'truncate' },
  },
});
```

### Eight overflow strategies

When content exceeds its budget, slotmux doesn't silently drop messages. You choose what happens — per slot:

| Strategy | Behavior |
| --- | --- |
| `truncate` | FIFO — drop oldest items first |
| `truncate-latest` | LIFO — drop newest items first |
| `sliding-window` | Keep last N items, then truncate |
| `summarize` | Progressive or map-reduce summarization |
| `semantic` | Keep the most relevant items by embedding similarity |
| `compress` | Lossless text compression (stop words, whitespace) |
| `error` | Throw if the slot overflows |
| `fallback-chain` | Summarize → compress → truncate → error |

Bring your own strategy with a simple async function.

### Immutable snapshots

Every `build()` produces a frozen `ContextSnapshot` — messages, token counts, per-slot metadata, warnings, build timing. Snapshots are safe to cache, serialize, diff, and replay. Structural sharing across builds keeps memory allocation minimal.

```typescript
const diff = snap2.diff(snap1);
// → { added: [...], removed: [...], modified: [...], slotsModified: ['history'] }

const wire = snapshot.serialize();   // JSON-safe, SHA-256 checksummed
const restored = ContextSnapshot.deserialize(wire);
```

### Provider agnostic

Slotmux compiles to its own intermediate format. Formatters convert to any provider's shape:

```typescript
import { formatOpenAIMessages } from '@slotmux/providers';
import { formatAnthropicMessages } from '@slotmux/providers';
import { formatGoogleMessages } from '@slotmux/providers';
```

Works with OpenAI, Anthropic, Google, Mistral, local models — same context logic everywhere.

### Tiny runtime

The core is **7 kB gzipped**. No framework lock-in, no heavy dependencies. Tree-shakeable ESM with full TypeScript types and Zod-backed config validation.

## Packages

| Package | Size (gzip) | What it does |
| --- | --- | --- |
| `slotmux` | 7 kB | Core — slots, budgets, build pipeline, snapshots |
| `@slotmux/providers` | 3 kB | OpenAI, Anthropic, Google message formatters |
| `@slotmux/react` | 2 kB | `ReactiveContext` + hooks for React apps |
| `@slotmux/compression` | — | Progressive, semantic, and lossless compression |
| `@slotmux/tokenizers` | — | Token counting adapters (gpt-tokenizer, tiktoken) |
| `@slotmux/plugin-rag` | — | RAG slot defaults, deduplication, citations |
| `@slotmux/plugin-tools` | — | Tool results management with auto-truncation |
| `@slotmux/plugin-memory` | — | Persistent memory stores |
| `@slotmux/plugin-otel` | — | OpenTelemetry traces and metrics |
| `@slotmux/debug` | — | Browser-based inspector UI for timelines and diffs |

## Install

```bash
npm install slotmux
```

Add a tokenizer for accurate token counting:

```bash
npm install gpt-tokenizer          # OpenAI models
```

## Quick start

Three presets get you started instantly:

```typescript
// Chat — system + history slots
createContext({ model: 'gpt-5.4', preset: 'chat' });

// RAG — system + documents + history + output slots
createContext({ model: 'gpt-5.4', preset: 'rag' });

// Agent — system + tools + scratchpad + history slots
createContext({ model: 'gpt-5.4', preset: 'agent' });
```

Or define your own slot layout from scratch — see the [concepts documentation](https://tfrydrychewicz.github.io/slotmux/concepts/slots).

## How it compares

| | slotmux | LangChain memory | tiktoken alone | Manual |
| --- | :---: | :---: | :---: | :---: |
| Slot-based allocation | **Yes** | — | — | — |
| Declarative budgets | **Yes** | — | — | — |
| Overflow strategies | **8 + custom** | 3 | — | DIY |
| Provider agnostic | **Yes** | Partial | OpenAI only | DIY |
| Cached token counting | **Yes** | Via wrappers | Yes | DIY |
| Plugin system | **Yes** | — | — | — |
| Immutable snapshots | **Yes** | — | — | — |
| Snapshot diffing | **Yes** | — | — | — |
| Serialization + checksums | **Yes** | — | — | DIY |
| Debug inspector | **Yes** | — | — | — |
| React bindings | **Yes** | — | — | — |
| TypeScript-first | **Strong** | Partial | Strong | Varies |
| Standalone (no framework) | **Yes** | Needs LangChain | Yes | Yes |
| Core bundle | **7 kB** | Large stack | ~5 kB | 0 |

## Documentation

| | |
| --- | --- |
| **Full docs** | [tfrydrychewicz.github.io/slotmux](https://tfrydrychewicz.github.io/slotmux/) |
| **Tutorial** | [Build a terminal chatbot](https://tfrydrychewicz.github.io/slotmux/guide/build-a-chatbot) — working chat app in 5 minutes |
| **Concepts** | [Slots](https://tfrydrychewicz.github.io/slotmux/concepts/slots) · [Budgets](https://tfrydrychewicz.github.io/slotmux/concepts/budgets) · [Overflow](https://tfrydrychewicz.github.io/slotmux/concepts/overflow) · [Compression](https://tfrydrychewicz.github.io/slotmux/concepts/compression) · [Snapshots](https://tfrydrychewicz.github.io/slotmux/concepts/snapshots) |
| **Frameworks** | [React](https://tfrydrychewicz.github.io/slotmux/guides/react) · [Vue](https://tfrydrychewicz.github.io/slotmux/guides/vue) · [Angular](https://tfrydrychewicz.github.io/slotmux/guides/angular) |
| **API reference** | [Generated TypeDoc](https://tfrydrychewicz.github.io/slotmux/reference/api/README) |

## Contributing

Issues and PRs are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, testing (`pnpm test:coverage`), changesets, and review expectations.

## License

[MIT](LICENSE)
