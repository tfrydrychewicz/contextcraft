# Migration from LangChain

This guide maps LangChain memory patterns to slotmux equivalents. Slotmux isn't a framework — it's a focused library for context window management. You keep your own LLM client, retrieval logic, and application code. Slotmux replaces the "how do I fit everything into the context window" layer.

## Conceptual mapping

| LangChain | slotmux | Notes |
| --- | --- | --- |
| `ChatMessageHistory` | `Context` + `ctx.user()` / `ctx.assistant()` | No separate history class — the context **is** your message store |
| `ConversationBufferMemory` | `preset: 'chat'` with `overflow: 'error'` | Keep everything, throw if it doesn't fit |
| `ConversationBufferWindowMemory` | `overflow: 'sliding-window'` | Keep last N messages |
| `ConversationSummaryMemory` | `overflow: 'summarize'` | Progressively summarize older messages |
| `ConversationTokenBufferMemory` | `overflow: 'truncate'` | Drop oldest messages to stay within budget |
| `VectorStoreRetrieverMemory` | `@slotmux/plugin-memory` | Persistent memory with retrieval strategies |
| `EntityMemory` | `@slotmux/plugin-memory` + custom extraction | Fact extraction with `autoExtract` |
| `BaseMemory.loadMemoryVariables` | `ctx.build()` → `snapshot` | One call produces the full context with metadata |
| Template variables (`{history}`, `{input}`) | Slots (`system`, `history`, `rag`, ...) | Named partitions instead of string interpolation |
| `chain.invoke()` | `ctx.build()` + `formatOpenAIMessages()` + API call | Slotmux doesn't call the LLM — you do |

## Migration examples

### Buffer memory → chat preset

**LangChain:**

```python
from langchain.memory import ConversationBufferMemory
from langchain.chains import ConversationChain

memory = ConversationBufferMemory()
chain = ConversationChain(llm=llm, memory=memory)
response = chain.predict(input="Hello!")
```

**Slotmux:**

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

// Each turn
ctx.user('Hello!');
const { snapshot } = await ctx.build();
const messages = formatOpenAIMessages(snapshot.messages);
const reply = await callYourLLM(messages);
ctx.assistant(reply);
```

**What you gain:** Token counting, budget enforcement, utilization metrics, overflow safety — all transparent in `snapshot.meta`.

### Window memory → sliding window overflow

**LangChain:**

```python
memory = ConversationBufferWindowMemory(k=10)
```

**Slotmux:**

```typescript
const { config } = createContext({
  model: 'gpt-5.4-mini',
  preset: 'chat',
  reserveForResponse: 4096,
  lazyContentItemTokens: true,
  slots: {
    history: {
      priority: 50,
      budget: { flex: true },
      overflow: 'sliding-window',
      overflowConfig: { windowSize: 10 },
      defaultRole: 'user',
      position: 'after',
    },
  },
});
```

**What you gain:** The window is token-budget-aware. If your 10 messages are huge, truncation still kicks in. In LangChain, `k=10` is message-count only.

### Summary memory → summarize overflow

**LangChain:**

```python
memory = ConversationSummaryMemory(llm=llm)
```

**Slotmux:**

```typescript
const { config } = createContext({
  model: 'gpt-5.4-mini',
  preset: 'chat',
  reserveForResponse: 4096,
  lazyContentItemTokens: true,
  slotmuxProvider: openai({ apiKey: process.env.OPENAI_API_KEY! }),
  slots: {
    history: {
      priority: 50,
      budget: { flex: true },
      overflow: 'summarize',
      overflowConfig: {
        summarizer: 'builtin:progressive',
        preserveLastN: 10,            // or omit for dynamic sizing
        proactiveThreshold: 0.85,     // optional: compress early
      },
      defaultRole: 'user',
      position: 'after',
    },
  },
});
```

**What you gain:** Budget-aware progressive summarization that fills available space instead of producing terse summaries. Dynamic `preserveLastN` scales with your budget. Optional proactive compression spreads the load across builds. Token budget enforcement. The summary only runs when the slot actually overflows (or exceeds `proactiveThreshold`), not on every turn.

### RAG chain → rag preset

**LangChain:**

```python
from langchain.chains import RetrievalQA

qa_chain = RetrievalQA.from_chain_type(
    llm=llm,
    retriever=vectorstore.as_retriever(search_kwargs={"k": 5}),
)
response = qa_chain.run("What is X?")
```

**Slotmux:**

```typescript
import { ragPlugin } from '@slotmux/plugin-rag';

const plugin = ragPlugin({ maxChunks: 20, citationTracking: true });

const { config } = createContext({
  model: 'gpt-5.4',
  preset: 'rag',
  reserveForResponse: 4096,
  lazyContentItemTokens: true,
  plugins: [plugin],
});

const ctx = Context.fromParsedConfig(config);
ctx.system('Answer based on the provided documents.');

// You do the retrieval
const chunks = await yourVectorStore.search(query, { limit: 10 });
ctx.push('rag', chunks.map((c) => ({
  content: c.text,
  metadata: { 'rag.chunkId': c.id, 'rag.score': c.score },
})));

ctx.user(query);
const { snapshot } = await ctx.build();

// You call the LLM
const messages = formatOpenAIMessages(snapshot.messages);
const reply = await callYourLLM(messages);

// Track which documents were actually used
const citations = plugin.getRagCitations();
```

**What you gain:** Separate token budgets for documents vs. history. Automatic deduplication. Citation tracking. Semantic overflow based on relevance to the query.

### Entity memory → memory plugin

**LangChain:**

```python
memory = ConversationEntityMemory(llm=llm)
```

**Slotmux:**

```typescript
import { memoryPlugin, InMemoryMemoryStore } from '@slotmux/plugin-memory';

const store = new InMemoryMemoryStore();

const { config } = createContext({
  model: 'gpt-5.4-mini',
  preset: 'chat',
  reserveForResponse: 4096,
  lazyContentItemTokens: true,
  plugins: [
    memoryPlugin({
      store,
      autoExtract: true,
      retrievalStrategy: 'hybrid',
      memoryBudget: { percent: 10 },
    }),
  ],
});
```

The memory plugin:
- Injects a `memory` slot for retrieved facts.
- On each build, searches the store for memories relevant to the latest user message.
- Optionally extracts new facts from the conversation after each build (`autoExtract`).
- Supports `'recency'`, `'relevance'`, and `'hybrid'` retrieval strategies.

## Key differences

### You own the LLM call

Slotmux doesn't wrap your LLM. You call `build()` to get the context, format it, and make the API call yourself. This means:

- **No vendor lock-in** — switch providers by changing a formatter, not a chain class.
- **Full control** — streaming, retries, error handling are yours.
- **Debuggable** — you can inspect `snapshot.messages` and `snapshot.meta` before sending anything.

### Slots replace templates

Instead of `PromptTemplate` with `{history}` and `{context}` variables:

```python
# LangChain
template = "System: {system}\n\nContext: {context}\n\nHistory: {history}\n\nUser: {input}"
```

Slotmux uses named slots with explicit budgets:

```typescript
// Slotmux
slots: {
  system:  { priority: 100, budget: { fixed: 2000 } },
  context: { priority: 80,  budget: { percent: 40 } },
  history: { priority: 50,  budget: { flex: true } },
}
```

Each slot manages its own overflow independently. No string concatenation, no guessing if the template will fit.

### Token budgets are first-class

LangChain memory classes have a `max_token_limit` parameter, but it's per-memory, not per-context-window. Slotmux allocates budgets across **all** slots simultaneously, guaranteeing the total fits the model's context window.

## Next

- [Concepts: Slots](/concepts/slots) — how slots work.
- [Concepts: Budgets](/concepts/budgets) — budget types and allocation.
- [End-to-end chatbot](./chatbot) — full chatbot guide.
