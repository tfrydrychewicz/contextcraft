# Building a custom plugin

Plugins extend slotmux's build pipeline with custom logic — slot injection, content filtering, overflow modification, observability, and more. This guide walks through building a plugin from scratch.

## The plugin interface

Every plugin implements the `ContextPlugin` interface:

```typescript
interface ContextPlugin {
  readonly name: string;
  readonly version: string;

  // Lifecycle hooks (all optional)
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

## Hook execution order

Hooks run at specific points in the `build()` pipeline:

```
createContext()
  └─ prepareSlots         ← inject/modify slot definitions

ctx.push() / ctx.user()
  └─ onContentAdded       ← react to new content

ctx.build()
  ├─ install              ← one-time setup (first build only)
  ├─ beforeBudgetResolve  ← modify slot configs before allocation
  ├─ afterBudgetResolve   ← observe resolved budgets
  ├─ beforeOverflow       ← filter/transform items per slot
  ├─ afterOverflow        ← observe evictions per slot
  ├─ beforeSnapshot       ← transform compiled messages
  ├─ afterSnapshot        ← observe the final snapshot
  └─ onEvent              ← observe all pipeline events

ctx.destroy()
  └─ destroy              ← cleanup resources
```

## Example: content filter plugin

Let's build a plugin that filters out messages containing certain keywords before they enter the build pipeline:

```typescript
import type { ContextPlugin, ContentItem, PluginOverflowEnv } from 'slotmux';

type ContentFilterOptions = {
  readonly blocklist: string[];
  readonly replacement?: string;
  readonly slots?: string[];
};

export function contentFilterPlugin(options: ContentFilterOptions): ContextPlugin {
  const { blocklist, replacement = '[redacted]', slots: targetSlots } = options;
  const patterns = blocklist.map((word) => new RegExp(word, 'gi'));

  return {
    name: 'content-filter',
    version: '1.0.0',

    beforeOverflow(
      slot: string,
      items: ContentItem[],
      _env?: PluginOverflowEnv,
    ): ContentItem[] {
      if (targetSlots && !targetSlots.includes(slot)) {
        return items;
      }

      return items.map((item) => {
        if (typeof item.content !== 'string') return item;

        let filtered = item.content;
        for (const pattern of patterns) {
          filtered = filtered.replace(pattern, replacement);
        }

        if (filtered === item.content) return item;

        return {
          ...item,
          content: filtered,
          tokens: undefined, // invalidate cached count — will be recounted
          metadata: {
            ...item.metadata,
            'filter.redacted': true,
          },
        };
      });
    },
  };
}
```

Register it:

```typescript
const { config } = createContext({
  model: 'gpt-5.4',
  preset: 'chat',
  lazyContentItemTokens: true,
  plugins: [
    contentFilterPlugin({
      blocklist: ['password', 'secret', 'api_key'],
      slots: ['history'],
    }),
  ],
});
```

## Example: slot injection plugin

Use `prepareSlots` to inject a new slot if it doesn't exist. This runs during `createContext()`, before validation:

```typescript
export function metadataPlugin(): ContextPlugin {
  return {
    name: 'metadata-slot',
    version: '1.0.0',

    prepareSlots(slots) {
      if (slots['metadata']) return slots;

      return {
        ...slots,
        metadata: {
          priority: 95,
          budget: { fixed: 500 },
          overflow: 'error',
          defaultRole: 'system',
          position: 'before',
        },
      };
    },
  };
}
```

## Example: observability plugin

The `onEvent` hook receives every pipeline event — useful for logging, metrics, or tracing:

```typescript
export function loggingPlugin(): ContextPlugin {
  return {
    name: 'logging',
    version: '1.0.0',

    onEvent(event) {
      switch (event.type) {
        case 'build:start':
          console.log('[build] started');
          break;
        case 'build:complete':
          console.log(`[build] complete in ${event.buildTimeMs}ms`);
          break;
        case 'slot:overflow':
          console.log(`[overflow] ${event.slot}: ${event.evictedCount} items evicted`);
          break;
        case 'content:evicted':
          console.log(`[evicted] item ${event.itemId} from ${event.slot}`);
          break;
      }
    },

    afterSnapshot(snapshot) {
      const { totalTokens, totalBudget, utilization } = snapshot.meta;
      console.log(`[snapshot] ${totalTokens}/${totalBudget} tokens (${(utilization * 100).toFixed(1)}%)`);
    },
  };
}
```

For production observability, use the built-in `@slotmux/plugin-otel` package which emits OpenTelemetry spans and metrics.

## Example: budget modifier plugin

Use `beforeBudgetResolve` to dynamically adjust slot configs based on runtime conditions:

```typescript
export function dynamicBudgetPlugin(options: {
  getHistoryBudget: () => number;
}): ContextPlugin {
  return {
    name: 'dynamic-budget',
    version: '1.0.0',

    beforeBudgetResolve(slots) {
      return slots.map((slot) => {
        if (slot.name === 'history') {
          return {
            ...slot,
            budget: { fixed: options.getHistoryBudget() },
          };
        }
        return slot;
      });
    },
  };
}
```

## Plugin context

The `install` hook receives a `PluginContext` with utilities:

```typescript
export function advancedPlugin(): ContextPlugin {
  return {
    name: 'advanced',
    version: '1.0.0',

    install(ctx) {
      // Access slot configuration
      const slots = ctx.getSlots();

      // Register a custom overflow strategy by name
      ctx.registerOverflowStrategy('my-strategy', async (items, budget, overflowCtx) => {
        return items.filter((item) => !item.metadata?.lowPriority);
      });

      // Register a custom compressor
      ctx.registerCompressor('my-compressor', {
        compress: async (text) => text.replace(/\s+/g, ' ').trim(),
      });

      // Use the logger
      ctx.logger.info('Plugin installed');
    },
  };
}
```

Custom overflow strategies registered via `registerOverflowStrategy` can be referenced by name in slot configs:

```typescript
slots: {
  history: {
    priority: 50,
    budget: { flex: true },
    overflow: 'my-strategy',  // uses the registered custom strategy
  },
}
```

## Existing plugins as reference

Study these built-in plugins for patterns:

| Plugin | Key hooks | Pattern |
| --- | --- | --- |
| `@slotmux/plugin-rag` | `prepareSlots`, `afterBudgetResolve`, `beforeOverflow`, `afterOverflow` | Slot injection, dedup, rerank, citation tracking |
| `@slotmux/plugin-tools` | `prepareSlots`, `beforeOverflow` | Large result truncation, result cap |
| `@slotmux/plugin-memory` | `prepareSlots`, `afterBudgetResolve`, `beforeOverflow`, `afterSnapshot` | Memory retrieval, fact extraction |
| `@slotmux/plugin-otel` | `onEvent` | OpenTelemetry spans and metrics |

## Next

- [Concepts: Slots](/concepts/slots) — slot configuration reference.
- [Concepts: Overflow](/concepts/overflow) — built-in overflow strategies.
- [Agent with tools](./agent-with-tools) — using the tools plugin in an agent loop.
