# Presets and defaults

Slotmux ships three preset slot layouts — `chat`, `rag`, and `agent` — that give you a working context configuration in one line. This guide explains what each preset configures, why those defaults were chosen, how to customize them, and when to build from scratch.

## Using a preset

```typescript
import { createContext, Context } from 'slotmux';

const { config } = createContext({
  model: 'gpt-5.4',
  preset: 'chat',
});
const ctx = Context.fromParsedConfig(config);
```

That's it. The preset defines the slots, their priorities, budgets, overflow strategies, roles, and positions.

## Chat preset

Two slots for a conversational interface:

| Slot | Priority | Budget | Position | Role | Overflow |
| --- | --- | --- | --- | --- | --- |
| `system` | 100 | fixed 2,000 | before | `system` | `error` |
| `history` | 50 | flex | after | `user` | `summarize` |

**Why these defaults:**

- **System** gets a fixed 2,000-token budget — enough for a detailed system prompt. `error` overflow means the build fails if the system prompt exceeds the budget, which is a configuration mistake you want to catch early.
- **History** fills the remaining space with flex budget. `summarize` overflow means older messages are compressed when the conversation grows long, preserving the gist without losing context entirely.

**Best for:** Chatbots, Q&A interfaces, customer support bots, personal assistants.

```typescript
createContext({ model: 'gpt-5.4', preset: 'chat' });
```

## RAG preset

Four slots for retrieval-augmented generation:

| Slot | Priority | Budget | Position | Role | Overflow |
| --- | --- | --- | --- | --- | --- |
| `system` | 100 | fixed 2,000 | before | `system` | `error` |
| `rag` | 80 | flex | before | `user` | `truncate` |
| `history` | 50 | flex | after | `user` | `summarize` |
| `output` | 40 | flex | after | `assistant` | `truncate` |

**Why these defaults:**

- **RAG** has higher priority than history, so retrieved documents get budget first. `truncate` drops the oldest documents when there are too many — on the assumption that more recent retrieval results are more relevant.
- **Output** holds assistant responses at low priority. Truncated when space is tight, since past responses are less important than the current query and documents.
- **History** uses `summarize` to preserve conversation continuity under pressure.

**Best for:** Document Q&A, knowledge bases, search-augmented chat.

```typescript
createContext({ model: 'gpt-5.4', preset: 'rag' });
```

## Agent preset

Four slots for tool-calling agent loops:

| Slot | Priority | Budget | Position | Role | Overflow |
| --- | --- | --- | --- | --- | --- |
| `system` | 100 | fixed 2,000 | before | `system` | `error` |
| `tools` | 85 | flex | before | `tool` | `truncate` |
| `scratchpad` | 65 | flex | interleave (order 10) | `user` | `truncate` |
| `history` | 50 | flex | after | `user` | `summarize` |

**Why these defaults:**

- **Tools** holds tool definitions and results at high priority — agents need their tools to function. `truncate` drops the oldest tool results when the context fills up.
- **Scratchpad** uses `interleave` position so agent reasoning steps appear in chronological order with conversation messages. Mid-priority and truncation mean reasoning can be dropped when space is tight.
- **History** provides conversation continuity via summarization.

**Best for:** Function-calling agents, ReAct loops, multi-step tool pipelines.

```typescript
createContext({ model: 'gpt-5.4', preset: 'agent' });
```

## Default when nothing is specified

When you pass neither `preset` nor `slots`, slotmux defaults to the **chat** preset:

```typescript
createContext({ model: 'gpt-5.4' });
// → same as preset: 'chat'
```

This means the simplest possible setup still gives you a working two-slot layout.

## Customizing a preset

### Overriding a slot

Pass `slots` alongside `preset` to override specific slots. Unmentioned preset slots are kept:

```typescript
createContext({
  model: 'gpt-5.4',
  preset: 'chat',
  slots: {
    history: {
      priority: 50,
      budget: { flex: true },
      overflow: 'truncate',  // changed from 'summarize'
      defaultRole: 'user',
      position: 'after',
    },
  },
});
// system slot: unchanged from preset
// history slot: uses truncate instead of summarize
```

### Adding a slot to a preset

You can add new slots on top of a preset:

```typescript
createContext({
  model: 'gpt-5.4',
  preset: 'chat',
  slots: {
    rag: {
      priority: 70,
      budget: { percent: 30 },
      overflow: 'semantic',
      defaultRole: 'user',
      position: 'before',
    },
  },
});
// system + history from chat, plus new rag slot
```

### Changing the system prompt budget

```typescript
createContext({
  model: 'gpt-5.4',
  preset: 'agent',
  slots: {
    system: {
      priority: 100,
      budget: { fixed: 5000 },  // more room for complex agent instructions
      overflow: 'error',
      defaultRole: 'system',
      position: 'before',
    },
  },
});
```

## Resolution rules

`createContext` resolves slots in this order:

| `preset` | `slots` | Result |
| --- | --- | --- |
| — | — | Chat preset (default) |
| `'rag'` | — | RAG preset |
| — | `{ ... }` | Exactly the provided slots |
| `'chat'` | `{ ... }` | `{ ...chatPreset, ...slots }` (shallow merge) |

The merge is shallow by slot name — if you provide a `history` key in `slots`, it replaces the preset's `history` entirely (not a deep merge of individual fields).

## Plugin slot injection

Plugins with a `prepareSlots` hook run after preset resolution. This lets plugins add their own slots when they're not already present:

```typescript
import { ragPlugin } from '@slotmux/plugin-rag';

createContext({
  model: 'gpt-5.4',
  preset: 'chat',
  plugins: [ragPlugin({ maxChunks: 20 })],
});
// ragPlugin.prepareSlots adds a 'rag' slot if absent
```

Resolution order: **preset → user `slots` merge → plugin `prepareSlots` → validation**.

If the user already provides a `rag` slot (via `slots` or by using `preset: 'rag'`), the plugin's `prepareSlots` can detect it and skip injection.

## Choosing the right preset

| Question | Preset |
| --- | --- |
| Simple chat with no external data? | `chat` |
| Need to include retrieved documents? | `rag` |
| Agent with tool/function calling? | `agent` |
| Multiple distinct use cases in one context? | Build from scratch |
| Need slots not in any preset? | Start with a preset + add via `slots` |

Start with a preset and customize as your application grows. The context API is the same regardless of whether you use a preset or define slots manually.

## Building from scratch

For full control, skip presets and define every slot yourself:

```typescript
createContext({
  model: 'gpt-5.4',
  maxTokens: 128_000,
  reserveForResponse: 8192,
  slots: {
    instructions: {
      priority: 100,
      budget: { fixed: 3000 },
      overflow: 'error',
      defaultRole: 'system',
      position: 'before',
    },
    examples: {
      priority: 90,
      budget: { fixed: 4000 },
      overflow: 'truncate',
      defaultRole: 'user',
      position: 'before',
    },
    context: {
      priority: 80,
      budget: { percent: 30 },
      overflow: 'semantic',
      defaultRole: 'user',
      position: 'before',
    },
    conversation: {
      priority: 50,
      budget: { flex: true },
      overflow: 'sliding-window',
      overflowConfig: { windowSize: 20 },
      defaultRole: 'user',
      position: 'after',
    },
    output: {
      priority: 30,
      budget: { flex: true, max: 2000 },
      overflow: 'truncate',
      defaultRole: 'assistant',
      position: 'after',
    },
  },
});
```

## Next

- [Presets concept](/concepts/presets) — the preset slot layouts in detail.
- [Slots concept](/concepts/slots) — slot configuration fields and ordering.
- [Budgets concept](/concepts/budgets) — fixed, percent, flex, and bounded-flex budgets.
