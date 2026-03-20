# Plugins

Plugins extend slotmux's build pipeline at well-defined lifecycle points. They can inject slots, transform content, register custom overflow strategies, observe events, and integrate with external systems — all without modifying core logic.

Slotmux follows **composition over inheritance**: plugins are plain objects implementing the `ContextPlugin` interface. There are no base classes to extend.

## The plugin interface

```typescript
interface ContextPlugin {
  readonly name: string;
  readonly version: string;

  install?(ctx: PluginContext): void | Promise<void>;
  prepareSlots?(slots: Record<string, SlotConfig>): Record<string, SlotConfig>;
  beforeBudgetResolve?(slots: SlotConfig[]): SlotConfig[] | Promise<SlotConfig[]>;
  afterBudgetResolve?(slots: readonly ResolvedSlot[]): void | Promise<void>;
  beforeOverflow?(slot: string, items: ContentItem[], env?: PluginOverflowEnv): ContentItem[] | Promise<ContentItem[]>;
  afterOverflow?(slot: string, items: ContentItem[], evicted: ContentItem[]): void | Promise<void>;
  beforeSnapshot?(messages: CompiledMessage[]): CompiledMessage[] | Promise<CompiledMessage[]>;
  afterSnapshot?(snapshot: ContextSnapshot): void | Promise<void>;
  onContentAdded?(slot: string, item: ContentItem): void | Promise<void>;
  onEvent?(event: ContextEvent): void;
  destroy?(): void | Promise<void>;
}
```

Only `name` and `version` are required. Implement only the hooks you need.

## Lifecycle hooks in pipeline order

Hooks fire at specific points during `createContext()`, content insertion, `build()`, and cleanup:

```
createContext()
  └─ prepareSlots         ← inject or modify slot definitions

ctx.push() / ctx.user()
  └─ onContentAdded       ← react to new content

ctx.build() (first call)
  └─ install              ← one-time setup, receive PluginContext

ctx.build() (every call)
  ├─ beforeBudgetResolve  ← modify slot configs before allocation
  ├─ afterBudgetResolve   ← observe resolved budgets
  ├─ beforeOverflow       ← filter/transform items per slot
  ├─ afterOverflow        ← observe evictions per slot
  ├─ beforeSnapshot       ← transform compiled messages
  ├─ afterSnapshot        ← observe the final snapshot
  └─ onEvent              ← receive all pipeline events

cleanup
  └─ destroy              ← release resources
```

### Hook details

| Hook | Phase | Can transform? | Receives |
| --- | --- | --- | --- |
| `prepareSlots` | Config creation | Yes — return modified slots | Full slot record |
| `install` | First build | No (setup only) | `PluginContext` |
| `beforeBudgetResolve` | Build | Yes — return modified configs | Slot configs array |
| `afterBudgetResolve` | Build | No (observe only) | Resolved slots with budgets |
| `beforeOverflow` | Build, per slot | Yes — return filtered items | Slot name, items, optional env |
| `afterOverflow` | Build, per slot | No (observe only) | Slot name, surviving items, evicted items |
| `beforeSnapshot` | Build | Yes — return modified messages | Compiled message array |
| `afterSnapshot` | Build | No (observe only) | Final `ContextSnapshot` |
| `onContentAdded` | Mutation | No (observe only) | Slot name, added `ContentItem` |
| `onEvent` | Any | No (observe only) | Any `ContextEvent` |
| `destroy` | Cleanup | No | Nothing |

Hooks that **can transform** return a new value that replaces the input for subsequent processing. Hooks that **observe** have `void` return types.

## PluginContext

The `install` hook receives a `PluginContext` with utilities:

```typescript
interface PluginContext {
  getSlots(): Record<string, SlotConfig>;
  tokenCounter: TokenCountCache;
  registerOverflowStrategy(name: string, strategy: OverflowStrategyFn): void;
  registerCompressor(name: string, compressor: CompressionStrategy): void;
  logger: PluginLogger;
}
```

| Field | Purpose |
| --- | --- |
| `getSlots()` | Read the current slot configuration. |
| `tokenCounter` | Count tokens for strings (uses the configured tokenizer with caching). |
| `registerOverflowStrategy` | Register a named overflow strategy function — usable as `overflow: 'my-name'` in slot configs. |
| `registerCompressor` | Register a named compression strategy — also becomes available as an overflow strategy by name. The compressor's `.name` must match the registration key. |
| `logger` | A logger scoped to this plugin (e.g. `[slotmux:my-plugin]` prefix). |

### Registering custom strategies

Strategies registered during `install` can be referenced by name in slot configs:

```typescript
install(ctx) {
  ctx.registerOverflowStrategy('keep-pinned-only', (items, budget) => {
    return items.filter((item) => item.pinned);
  });
}

// Then in slot config:
{ overflow: 'keep-pinned-only' }
```

## Error isolation

Each hook call is wrapped in a try/catch. If a plugin throws during a hook:

- The error is logged (if a logger is configured).
- Other plugins continue to run.
- The build pipeline is not interrupted.

The exception: if `install` throws, the plugin's registrations (strategies, compressors) are rolled back and the error is re-thrown to the caller.

## Async hooks

All hooks except `onEvent` can return a `Promise`. The pipeline awaits each hook before proceeding. Hooks run in **registration order** — the first plugin registered runs first.

`onEvent` is synchronous-only by design, matching the synchronous event emitter.

## Execution order with multiple plugins

When multiple plugins are registered, hooks run in registration order for each pipeline step. For transforming hooks, the output of one plugin becomes the input of the next:

```
Plugin A: beforeOverflow → returns filteredItems₁
Plugin B: beforeOverflow → receives filteredItems₁, returns filteredItems₂
Overflow engine:         → processes filteredItems₂
```

## First-party plugins

Slotmux ships three first-party plugins:

| Plugin | Package | Key hooks | Purpose |
| --- | --- | --- | --- |
| RAG | `@slotmux/plugin-rag` | `prepareSlots`, `beforeOverflow`, `afterOverflow` | Auto-create `rag` slot, deduplication, reranking, citation tracking |
| Tools | `@slotmux/plugin-tools` | `prepareSlots`, `beforeOverflow` | Auto-create `tools` slot, result truncation, schema counting |
| Memory | `@slotmux/plugin-memory` | `prepareSlots`, `beforeOverflow`, `afterSnapshot` | Persistent memory retrieval, auto-extraction, budget enforcement |

```typescript
import { ragPlugin } from '@slotmux/plugin-rag';
import { toolsPlugin } from '@slotmux/plugin-tools';

createContext({
  model: 'gpt-4o',
  plugins: [
    ragPlugin({ maxChunks: 20, deduplication: true }),
    toolsPlugin({ maxToolResults: 10 }),
  ],
});
```

## Writing a minimal plugin

```typescript
import type { ContextPlugin } from 'slotmux';

export function timestampPlugin(): ContextPlugin {
  return {
    name: 'timestamp',
    version: '1.0.0',

    beforeSnapshot(messages) {
      return messages.map((msg) => ({
        ...msg,
        content: typeof msg.content === 'string'
          ? `[${new Date().toISOString()}] ${msg.content}`
          : msg.content,
      }));
    },
  };
}
```

## Next

- [Events](./events) — the event types that `onEvent` receives.
- [Overflow](./overflow) — strategies you can register via `registerOverflowStrategy`.
- [Custom plugin guide](/guides/custom-plugin) — full walkthrough with examples.
