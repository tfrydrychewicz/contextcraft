---
layout: home

hero:
  name: Slotmux
  text: The memory allocator for LLM context windows
  image:
    src: /slotmux.svg
    alt: Slotmux logo
  tagline: Stop concatenating strings and hoping they fit. Declare slots, set budgets, call build() — slotmux handles the rest.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Build a chatbot in 5 min
      link: /guide/build-a-chatbot
    - theme: alt
      text: View on GitHub
      link: https://github.com/tfrydrychewicz/slotmux

features:
  - icon: 🧱
    title: Slots, not strings
    details: Partition your context into named slots — system prompt, history, documents, tools. Each with its own budget, priority, and overflow strategy.
  - icon: 🎯
    title: Token budgets that work
    details: Fixed, percentage, flex, or bounded allocations. Resolved top-down by priority, with response tokens reserved. The total never exceeds the context window.
  - icon: 🔄
    title: 8 overflow strategies
    details: Truncate, sliding window, summarize, semantic, compress, error, or build your own. Pick per slot. Fallback chains cascade automatically.
  - icon: 📸
    title: Immutable snapshots
    details: Every build() returns a frozen snapshot — messages, metadata, timing, per-slot stats. Safe to cache, serialize, diff, and replay.
  - icon: 🔌
    title: Any LLM provider
    details: Compile once, format for OpenAI, Anthropic, Google, Mistral, or Ollama. Same context logic everywhere. Swap models without rewriting prompts.
  - icon: ⚡
    title: 7 kB. Zero dependencies.
    details: Tree-shakeable ESM core. Sub-millisecond token counting. Lazy evaluation. No framework lock-in. TypeScript-first with Zod-backed validation.
---

<style>
.problem-section {
  max-width: 960px;
  margin: 4rem auto 0;
  padding: 0 24px;
}
.problem-section h2 {
  font-size: 1.6rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}
.problem-section p {
  color: var(--vp-c-text-2);
  font-size: 1.05rem;
  line-height: 1.7;
  margin-bottom: 1.5rem;
}
.code-demo {
  max-width: 960px;
  margin: 2rem auto 4rem;
  padding: 0 24px;
}
.code-demo h3 {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
}
.cta-section {
  text-align: center;
  padding: 3rem 24px 4rem;
}
.cta-section h2 {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}
.cta-section p {
  color: var(--vp-c-text-2);
  font-size: 1.05rem;
  margin-bottom: 1.5rem;
}
</style>

<div class="problem-section">

## The problem

Every LLM application manages a context window. System prompts, conversation history, RAG documents, tool results, agent scratchpads — they all compete for the same finite token budget. Most teams handle this with string concatenation, manual counting, and silent truncation. It works until it doesn't.

Slotmux replaces that fragile glue code with a **declarative system**. You describe what each section of your prompt needs. Slotmux figures out how to make it fit.

</div>

<div class="code-demo">

### Three lines to a production-ready context

```typescript
import { createContext, Context } from 'slotmux';
import { formatOpenAIMessages } from '@slotmux/providers';

const { config } = createContext({
  model: 'gpt-4o',
  preset: 'chat',                  // system + history slots, ready to go
  reserveForResponse: 4096,
});

const ctx = Context.fromParsedConfig(config);
ctx.system('You are a helpful assistant.');
ctx.user('What is the capital of France?');

const { snapshot } = await ctx.build();
const messages = formatOpenAIMessages(snapshot.messages);

// snapshot.meta → utilization: 0.02, totalTokens: 24, buildTimeMs: 1
```

### Scale to complex applications

```typescript
createContext({
  model: 'claude-sonnet-4-20250514',
  reserveForResponse: 8192,
  slots: {
    system:  { priority: 100, budget: { fixed: 2000 },   overflow: 'error' },
    docs:    { priority: 80,  budget: { percent: 40 },   overflow: 'semantic' },
    tools:   { priority: 70,  budget: { flex: true },     overflow: 'truncate' },
    history: { priority: 50,  budget: { flex: true },     overflow: 'summarize' },
  },
  plugins: [ragPlugin({ maxChunks: 20 }), sanitizePlugin()],
});
```

</div>

<div class="problem-section">

## Built for production

Slotmux is not a prototype tool. It ships with SHA-256 snapshot checksums, PII redaction on events and logs, prompt injection sanitization, per-slot resource limits with early warnings, and an error hierarchy with `recoverable` flags for graceful degradation.

Performance is enforced in CI: builds under 5ms for 100 messages, sub-millisecond cached token counting, and structural sharing across snapshots to minimize GC pressure.

</div>

<div class="problem-section">

## Works with your stack

| Framework | Integration |
| --- | --- |
| **React** | [`@slotmux/react`](/guides/react) hooks with `useSyncExternalStore` |
| **Vue** | [Native ref compatibility](/guides/vue) — `computed`, `watch`, composables |
| **Angular** | [Injectable services](/guides/angular) with Signals and `async` pipe |
| **Node.js** | Direct API — no framework needed |
| **Any provider** | OpenAI, Anthropic, Google, Mistral, Ollama — [one snapshot, any format](/concepts/providers) |

</div>

<div class="cta-section">

## Ready to stop worrying about context windows?

Install slotmux and build your first context in under a minute.

[Get started](/guide/getting-started) | [Tutorial: Build a chatbot](/guide/build-a-chatbot) | [API reference](/reference/api/README)

</div>
