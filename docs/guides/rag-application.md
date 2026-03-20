# RAG application

This guide shows how to build a retrieval-augmented generation (RAG) application with slotmux. You'll use dedicated slots for retrieved documents, automatic deduplication, relevance-based overflow, and citation tracking.

## Context structure

The `rag` preset creates four slots:

| Slot | Priority | Budget | Overflow | Purpose |
| --- | --- | --- | --- | --- |
| `system` | 100 | fixed 2 000 | `error` | System instructions |
| `rag` | 80 | flex | `truncate` | Retrieved document chunks |
| `history` | 50 | flex | `summarize` | Conversation history |
| `output` | 40 | flex | `truncate` | Model output buffer |

Higher-priority slots get their budget first. The `rag` slot (priority 80) is allocated before `history` (priority 50), ensuring retrieved documents have space even in long conversations.

```typescript
import { createContext, Context } from 'slotmux';

const { config } = createContext({
  model: 'gpt-4o',
  preset: 'rag',
  reserveForResponse: 4096,
  lazyContentItemTokens: true,
});

const ctx = Context.fromParsedConfig(config);
ctx.system(
  'You are a helpful assistant. Answer questions based on the provided documents. ' +
  'Cite your sources using [chunk-id].'
);
```

## Pushing documents

After retrieving chunks from your vector store, push them into the `rag` slot:

```typescript
const chunks = await vectorStore.search(userQuery, { limit: 10 });

ctx.push('rag', chunks.map((chunk) => ({
  content: chunk.text,
  role: 'user',
  metadata: {
    'rag.chunkId': chunk.id,
    'rag.score': chunk.score,
  },
})));
```

The metadata keys `rag.chunkId` and `rag.score` are used by the RAG plugin for deduplication, reranking, and citation tracking.

## The RAG plugin

`@slotmux/plugin-rag` adds automatic deduplication, chunk limiting, optional reranking, and citation tracking:

```bash
npm install @slotmux/plugin-rag
```

```typescript
import { ragPlugin } from '@slotmux/plugin-rag';

const plugin = ragPlugin({
  maxChunks: 20,
  deduplication: true,
  dedupeThreshold: 0.88,
  citationTracking: true,
  rerankOnOverflow: true,
});

const { config } = createContext({
  model: 'gpt-4o',
  preset: 'rag',
  reserveForResponse: 4096,
  lazyContentItemTokens: true,
  plugins: [plugin],
});
```

### Plugin options

| Option | Default | Description |
| --- | --- | --- |
| `slotName` | `'rag'` | Which slot to manage |
| `maxChunks` | `20` | Maximum chunks retained after dedup |
| `deduplication` | `true` | Remove near-duplicate chunks via Jaccard similarity |
| `dedupeThreshold` | `0.88` | Jaccard threshold — higher means stricter matching |
| `citationTracking` | `true` | Track which chunks survive overflow |
| `rerankOnOverflow` | `false` | Reorder chunks so low-scoring ones are evicted first |
| `rerank` | — | Custom rerank function for cross-encoder scoring |

### How the pipeline works

On each `build()`, the plugin runs these steps in order:

1. **Deduplication** — Compares each chunk to all earlier chunks using Jaccard word overlap. Chunks with similarity ≥ `dedupeThreshold` are dropped (later duplicates removed, earlier ones kept).

2. **Enforce max chunks** — If more than `maxChunks` remain, drops the lowest-scoring chunks (by `rag.score` metadata).

3. **Rerank** (optional) — When the slot is over budget and `rerankOnOverflow` is true, reorders chunks so the least relevant are at the front. Since `truncate` drops from the front (FIFO), this ensures the most relevant chunks survive.

4. **Citation tracking** — After overflow, records which chunk IDs survived. Retrieve them after the build:

```typescript
const { snapshot } = await ctx.build();
const citations = plugin.getRagCitations();
// → [{ chunkId: 'doc-42', itemId: 'item-abc' }, ...]
```

## Semantic overflow

For smarter overflow that keeps the most relevant chunks based on embedding similarity, use the `semantic` overflow strategy instead of `truncate`:

```typescript
const { config } = createContext({
  model: 'gpt-4o',
  preset: 'rag',
  reserveForResponse: 4096,
  lazyContentItemTokens: true,
  slots: {
    rag: {
      priority: 80,
      budget: { flex: true },
      overflow: 'semantic',
      overflowConfig: {
        embedFn: async (text) => {
          const response = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: text,
          });
          return response.data[0].embedding;
        },
        anchorTo: 'lastUserMessage',
        similarityThreshold: 0.5,
      },
      defaultRole: 'user',
      position: 'before',
    },
  },
  plugins: [ragPlugin({ citationTracking: true })],
});
```

When the rag slot overflows, the semantic strategy:
1. Embeds every chunk and the anchor (the user's latest question).
2. Drops chunks below the similarity threshold.
3. Greedily packs the most similar chunks within the token budget.

## Controlling budgets

For precise control over how much space documents get vs. conversation history, use percent or bounded-flex budgets:

```typescript
slots: {
  rag: {
    priority: 80,
    budget: { percent: 50 },    // 50% of available tokens
    overflow: 'truncate',
    defaultRole: 'user',
    position: 'before',
  },
  history: {
    priority: 50,
    budget: { flex: true },     // takes the rest
    overflow: 'truncate',
    defaultRole: 'user',
    position: 'after',
  },
}
```

## Conversation loop

A typical RAG conversation loop:

```typescript
async function handleTurn(userMessage: string) {
  // 1. Retrieve relevant documents
  const chunks = await vectorStore.search(userMessage, { limit: 15 });

  // 2. Clear previous documents and push fresh ones
  ctx.clearSlot('rag');
  ctx.push('rag', chunks.map((c) => ({
    content: c.text,
    metadata: { 'rag.chunkId': c.id, 'rag.score': c.score },
  })));

  // 3. Add user message
  ctx.user(userMessage);

  // 4. Build and format
  const { snapshot } = await ctx.build();
  const messages = formatOpenAIMessages(snapshot.messages);

  // 5. Call LLM
  const response = await callLLM(messages);

  // 6. Store assistant reply
  ctx.assistant(response);

  // 7. Check citations
  const citations = plugin.getRagCitations();

  return { response, citations, meta: snapshot.meta };
}
```

## Next

- [Concepts: Overflow](/concepts/overflow) — all eight overflow strategies.
- [Concepts: Compression](/concepts/compression) — semantic and progressive compression details.
- [Agent with tools](./agent-with-tools) — add tool calling to your RAG app.
