# Presets

Presets are ready-made slot layouts for common application patterns. Instead of defining slots from scratch, pick a preset and start pushing content immediately.

## Available presets

Slotmux ships three presets: `chat`, `rag`, and `agent`.

### `chat`

Two slots for a conversational interface. System instructions are fixed and protected; conversation history fills the remaining space and summarizes when full.

| Slot | Priority | Budget | Position | Role | Overflow |
| --- | --- | --- | --- | --- | --- |
| `system` | 100 | fixed 2 000 | before | `system` | `error` |
| `history` | 50 | flex | after | `user` | `summarize` |

```typescript
createContext({ model: 'gpt-4o', preset: 'chat' });
```

### `rag`

Four slots for retrieval-augmented generation. Retrieved documents get their own slot with truncation overflow; history summarizes under pressure; an output slot holds assistant responses.

| Slot | Priority | Budget | Position | Role | Overflow |
| --- | --- | --- | --- | --- | --- |
| `system` | 100 | fixed 2 000 | before | `system` | `error` |
| `rag` | 80 | flex | before | `user` | `truncate` |
| `history` | 50 | flex | after | `user` | `summarize` |
| `output` | 40 | flex | after | `assistant` | `truncate` |

```typescript
createContext({ model: 'gpt-4o', preset: 'rag' });
```

### `agent`

Four slots for tool-calling agent loops. Tool definitions and results have high priority; a scratchpad is interleaved for agent reasoning; history summarizes.

| Slot | Priority | Budget | Position | Role | Overflow |
| --- | --- | --- | --- | --- | --- |
| `system` | 100 | fixed 2 000 | before | `system` | `error` |
| `tools` | 85 | flex | before | `tool` | `truncate` |
| `scratchpad` | 65 | flex | interleave (order 10) | `user` | `truncate` |
| `history` | 50 | flex | after | `user` | `summarize` |

```typescript
createContext({ model: 'gpt-4o', preset: 'agent' });
```

## Using a preset

Pass the `preset` option to `createContext`:

```typescript
import { createContext, Context } from 'slotmux';

const { config } = createContext({
  model: 'gpt-4o-mini',
  preset: 'chat',
  reserveForResponse: 4096,
  lazyContentItemTokens: true,
});

const ctx = Context.fromParsedConfig(config);
ctx.system('You are a helpful assistant.');
ctx.user('Hello!');
```

## Customizing a preset

When both `preset` and `slots` are provided, custom slots **override** preset slots by name. Preset slots you don't mention are kept unchanged:

```typescript
createContext({
  model: 'gpt-4o',
  preset: 'chat',
  slots: {
    // Override history slot: use truncate instead of summarize
    history: {
      priority: 50,
      budget: { flex: true },
      overflow: 'truncate',
      defaultRole: 'user',
      position: 'after',
    },
  },
});
// Result: system slot from preset (unchanged) + customized history slot
```

You can also **add** new slots on top of a preset:

```typescript
createContext({
  model: 'gpt-4o',
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
// Result: system + history from chat preset + new rag slot
```

## Resolution rules

`createContext` resolves slots in this order:

1. **`slots` only** (no `preset`) — use exactly the provided slots.
2. **`preset` only** (no `slots`) — use the preset layout.
3. **Both** — shallow merge `{ ...preset, ...slots }`. Per-slot keys in `slots` win.
4. **Neither** — default to the `chat` preset.

This means if you pass no `preset` and no `slots`, you get the chat layout:

```typescript
createContext({ model: 'gpt-4o' });
// → same as preset: 'chat'
```

## Preset + plugin slot injection

Plugins with a `prepareSlots` hook run **after** preset resolution but **before** validation. This lets plugins inject their own slots if they're not already present:

```typescript
import { ragPlugin } from '@slotmux/plugin-rag';

createContext({
  model: 'gpt-4o',
  preset: 'chat',
  plugins: [ragPlugin({ maxChunks: 20 })],
});
// ragPlugin.prepareSlots adds a 'rag' slot if one doesn't exist
```

The order is: `preset → user slots merge → plugin prepareSlots → validation`.

## Building from scratch

For full control, skip presets entirely and define every slot yourself:

```typescript
createContext({
  model: 'gpt-4o',
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
    context: {
      priority: 80,
      budget: { percent: 40 },
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
  },
});
```

## Choosing the right preset

| Application type | Recommended preset | Why |
| --- | --- | --- |
| Chatbot | `chat` | Simple two-slot layout with summarization |
| Q&A over documents | `rag` | Dedicated slot for retrieved chunks |
| AI agent with function calling | `agent` | Slots for tool schemas, results, and scratchpad |
| Custom / complex | None — build from scratch | Full control over every slot |

Start with a preset and customize as your needs grow. You can always replace a preset with a fully custom layout later — the context API is the same either way.

## Next

- [Slots](./slots) — deep dive on slot configuration.
- [Budgets](./budgets) — how fixed, percent, and flex budgets are resolved.
- [Overflow](./overflow) — the strategies each preset slot uses.
