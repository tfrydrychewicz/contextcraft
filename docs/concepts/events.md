# Events

Slotmux emits structured events during the build pipeline and when content changes. Events give you full observability into what the library is doing — why content was evicted, which slots overflowed, how compression performed, and how long the build took.

## Subscribing to events

Pass an `onEvent` callback when creating a context:

```typescript
const { config } = createContext({
  model: 'gpt-4o-mini',
  preset: 'chat',
  onEvent(event) {
    switch (event.type) {
      case 'slot:overflow':
        console.warn(`Slot "${event.slot}" overflowed: ${event.beforeTokens} → ${event.afterTokens}`);
        break;
      case 'build:complete':
        console.log(`Build done in ${event.snapshot.meta.buildTimeMs}ms`);
        break;
    }
  },
});
```

The callback receives every event fired during `build()`, `buildStream()`, and content mutations. Events are delivered synchronously — the handler runs before the next pipeline step.

## Event types

Slotmux defines 10 event types as a `ContextEvent` discriminated union. TypeScript narrows the payload when you switch on `event.type`.

### Content events

| Type | When | Key fields |
| --- | --- | --- |
| `content:added` | `ctx.user()`, `ctx.push()`, etc. | `slot`, `item` (the `ContentItem` added) |
| `content:evicted` | Overflow removes an item | `slot`, `item`, `reason` (human-readable) |
| `content:pinned` | `ctx.pin()` marks an item | `slot`, `item` |

### Slot events

| Type | When | Key fields |
| --- | --- | --- |
| `slot:budget-resolved` | Budget allocator assigns tokens | `slot`, `budgetTokens` |
| `slot:overflow` | Overflow strategy runs on a slot | `slot`, `strategy`, `beforeTokens`, `afterTokens` |

### Compression events

| Type | When | Key fields |
| --- | --- | --- |
| `compression:start` | A compression strategy begins | `slot`, `itemCount` |
| `compression:complete` | Compression finishes | `slot`, `beforeTokens`, `afterTokens`, `ratio` |

### Build events

| Type | When | Key fields |
| --- | --- | --- |
| `build:start` | `build()` or `buildStream()` begins | `totalBudget` |
| `build:complete` | Build produces a snapshot | `snapshot` (full `ContextSnapshot`) |

### Warning events

| Type | When | Key fields |
| --- | --- | --- |
| `warning` | Non-fatal issue detected | `warning` (`{ code, message, slot?, severity }`) |

Warning codes include `SLOT_ITEMS_NEAR_LIMIT` (80% of `maxItems` reached), protected slot over budget, and others.

## When events fire

Events fire at specific points in the build pipeline:

```
ctx.user('Hello')
  → content:added

ctx.build()
  → build:start
  → slot:budget-resolved  (one per slot)
  → compression:start     (if summarize/compress strategy runs)
  → compression:complete
  → content:evicted       (one per evicted item)
  → slot:overflow         (one per overflowing slot)
  → warning               (if any non-fatal issues)
  → build:complete        (with the final snapshot)
```

Content events (`content:added`, `content:pinned`) fire immediately when you call the mutating method — they don't wait for `build()`.

## The ContextEvent union

```typescript
type ContextEvent =
  | ContentAddedEvent
  | ContentEvictedEvent
  | ContentPinnedEvent
  | SlotOverflowEvent
  | SlotBudgetResolvedEvent
  | CompressionStartEvent
  | CompressionCompleteEvent
  | BuildStartEvent
  | BuildCompleteEvent
  | WarningEvent;
```

Each event interface has a `readonly type` discriminator, so `switch (event.type)` gives you full type narrowing in TypeScript.

## Event emitter internals

Under the hood, slotmux uses a `TypedEventEmitter` — a synchronous, type-safe observer:

- **`emit(event)`** — delivers to all listeners registered for `event.type`, in registration order.
- **`on(type, handler)`** — subscribe to a specific event type.
- **`off(type, handler)`** — unsubscribe.
- **`once(type, handler)`** — one-shot subscription (auto-removes after first delivery).
- **Error isolation** — if a listener throws, the exception is swallowed so other listeners still run.

You don't need to use the emitter directly unless you're building a plugin. The `onEvent` config callback is the standard consumer API.

## Plugins and events

Plugins receive events through the `onEvent` lifecycle hook:

```typescript
const myPlugin: ContextPlugin = {
  name: 'my-logger',
  version: '1.0.0',
  onEvent(event) {
    if (event.type === 'slot:overflow') {
      metrics.increment('overflow_count', { slot: event.slot });
    }
  },
};
```

The `onEvent` hook runs for every event type — the same events that `onEvent` on the config receives. Plugins also have access to more specific hooks (`afterOverflow`, `afterSnapshot`, etc.) for transforming data at those points.

## Content redaction

By default, event payloads are **redacted** before delivery to `onEvent` and loggers. This prevents PII from leaking into logs or monitoring systems.

Redaction applies built-in patterns for:
- Social Security Numbers (`\d{3}-\d{2}-\d{4}`)
- Email addresses
- Credit card–like numbers

Content in the actual context (what gets sent to the LLM) is **never** redacted — only the copies in events and logs.

### Controlling redaction

| Config | Behavior |
| --- | --- |
| Omitted / `undefined` | Redaction is **on** (default patterns) |
| `redaction: true` | Redaction is **on** (default patterns) |
| `redaction: { patterns: [...] }` | Redaction with custom RegExp patterns |
| `redaction: false` | Redaction is **off** |
| `logLevel: 'trace'` | Redaction is **off** (full observability mode) |

```typescript
createContext({
  model: 'gpt-4o',
  redaction: {
    patterns: [/\bSECRET_\w+/g],
    replacement: '[HIDDEN]',
  },
});
```

## Practical patterns

### Metrics collection

```typescript
onEvent(event) {
  switch (event.type) {
    case 'build:complete':
      gauge('context.utilization', event.snapshot.meta.utilization);
      histogram('context.build_ms', event.snapshot.meta.buildTimeMs);
      break;
    case 'compression:complete':
      histogram('compression.ratio', event.ratio, { slot: event.slot });
      break;
    case 'slot:overflow':
      counter('overflow.count', 1, { slot: event.slot, strategy: event.strategy });
      break;
  }
}
```

### Debugging context issues

```typescript
onEvent(event) {
  if (event.type === 'content:evicted') {
    console.log(`Evicted from ${event.slot}: ${event.reason}`);
  }
  if (event.type === 'warning') {
    console.warn(`[${event.warning.severity}] ${event.warning.message}`);
  }
}
```

## Next

- [Plugins](./plugins) — how plugins subscribe to events and transform the pipeline.
- [Snapshots](./snapshots) — the `build:complete` event carries a `ContextSnapshot`.
- [Overflow](./overflow) — strategies that trigger `slot:overflow` events.
