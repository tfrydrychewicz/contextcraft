# Pinning and ephemeral content

Slotmux gives you fine-grained control over which content items survive overflow and which disappear after a build. **Pinning** makes an item immune to eviction. **Ephemeral** marks an item for automatic removal after the next build.

## Pinning

Pin an item to protect it from overflow strategies:

```typescript
const item = ctx.push('history', [{ content: 'Critical instruction', role: 'user' }]);
ctx.pin('history', item[0]);
```

Pinned items:
- **Cannot be evicted** by any overflow strategy (truncate, sliding-window, semantic, etc.).
- **Cannot be removed** by the global budget escalation engine.
- **Stay in the slot** even when non-pinned items around them are evicted.
- **Emit a `content:pinned` event** when pinned.

### Pin by item or by ID

`ctx.pin()` accepts a `ContentItem`, an object with an `id` property, or a raw `ContentId`:

```typescript
// Pin by item reference
ctx.pin('history', item);

// Pin by ID
ctx.pin('history', item.id);

// Pin by object with id
ctx.pin('history', { id: item.id });
```

### Use sparingly

Every pinned item consumes budget that can't be reclaimed by overflow. If you pin too many items in a slot, the remaining non-pinned items get squeezed into a smaller budget. In extreme cases, the slot can't fit within its budget even after evicting all non-pinned items — resulting in a warning (for protected slots) or the items being pushed out of other slots during escalation.

## Ephemeral content

Mark an item as ephemeral to auto-remove it after the next build:

```typescript
const items = ctx.push('tools', [{
  content: JSON.stringify(toolResult),
  role: 'tool',
}]);
ctx.ephemeral('tools', items[0]);
```

Ephemeral items:
- **Participate in the current build** — they appear in the snapshot normally.
- **Are removed from the slot** after `build()` or `buildStream()` completes.
- **Don't need manual cleanup** — the build pipeline calls `clearEphemeral()` automatically.

### Setting ephemeral on push

You can also set `ephemeral: true` directly when pushing:

```typescript
ctx.push('tools', [{
  content: JSON.stringify(toolResult),
  role: 'tool',
  ephemeral: true,
}]);
```

## How overflow respects pins

### Strategy-level behavior

All built-in overflow strategies skip pinned items:

| Strategy | Behavior with pinned items |
| --- | --- |
| `truncate` | FIFO eviction of non-pinned items only |
| `truncate-latest` | LIFO eviction of non-pinned items only |
| `sliding-window` | Window over non-pinned items; all pinned items kept |
| `semantic` | Scores non-pinned items; pinned items always retained |
| `summarize` | Summarizes non-pinned items; pinned items kept verbatim |
| `compress` | Compresses non-pinned items; pinned items untouched |
| `error` | Throws if total (including pinned) exceeds budget |

### Global budget escalation

When the total context exceeds the model's token limit after all per-slot overflow, the engine runs **escalation**: it picks the lowest-priority non-protected slot and removes all **non-pinned** items from it. Pinned items survive even escalation.

```
Escalation target selection:
1. Sort slots by priority ascending
2. Skip protected slots
3. Find the first slot with any non-pinned items
4. Remove all non-pinned items from that slot
5. Re-resolve budgets
6. Repeat if still over budget
```

## Combining pinning and ephemeral

Pin and ephemeral are independent flags on a `ContentItem`:

| `pinned` | `ephemeral` | Behavior |
| --- | --- | --- |
| `false` | `false` | Normal — subject to overflow, persists across builds |
| `true` | `false` | Protected from overflow, persists across builds |
| `false` | `true` | Subject to overflow, removed after next build |
| `true` | `true` | Protected from overflow, removed after next build |

A pinned + ephemeral item is useful for a one-shot critical instruction that must appear in exactly one build and then disappear.

## The `protected` slot flag

The slot-level `protected` flag is different from per-item pinning:

```typescript
createContext({
  model: 'gpt-4o',
  slots: {
    system: {
      priority: 100,
      budget: { fixed: 2000 },
      protected: true,         // slot-level protection
      defaultRole: 'system',
      position: 'before',
    },
  },
});
```

| Feature | `protected` slot | `pinned` item |
| --- | --- | --- |
| Scope | All items in the slot | Individual item |
| Overflow | Content is never evicted; warning emitted if over budget | Item is never evicted; other items in the slot can be |
| Escalation | Slot is skipped entirely | Item survives; slot can still be an escalation target |
| Use case | System prompt, critical configuration | Key messages in a mixed slot |

## Practical patterns

### Pinning critical tool results

In agent loops, some tool results are essential context for subsequent reasoning:

```typescript
const items = ctx.push('tools', [{
  content: JSON.stringify({ schema: dbSchema }),
  role: 'tool',
}]);
ctx.pin('tools', items[0]);
// This schema is now protected from overflow
```

### Ephemeral function call outputs

Function call results that only matter for the immediate response:

```typescript
ctx.push('scratchpad', [{
  content: `Current time: ${new Date().toISOString()}`,
  role: 'user',
  ephemeral: true,
}]);
// Appears in this build, removed before the next one
```

### Pinning the initial system prompt message

If you have multiple system messages and want to ensure the first one is never lost:

```typescript
const items = ctx.push('system', [{
  content: 'You are a financial advisor. Never give specific investment advice.',
  role: 'system',
}]);
ctx.pin('system', items[0]);
```

### Ephemeral search results

In RAG applications, search results from the current query can be ephemeral — they'll be replaced by new results on the next query:

```typescript
for (const doc of searchResults) {
  ctx.push('rag', [{
    content: doc.text,
    role: 'user',
    ephemeral: true,
  }]);
}
// After build(), all these results are cleared
// Next query pushes fresh results
```

## Inspecting pinned and ephemeral items

Check item flags through the context API:

```typescript
const items = ctx.getItems('history');
const pinnedCount = items.filter((i) => i.pinned).length;
const ephemeralCount = items.filter((i) => i.ephemeral).length;
console.log(`${pinnedCount} pinned, ${ephemeralCount} ephemeral, ${items.length} total`);
```

The `content:pinned` event fires when an item is pinned:

```typescript
onEvent(event) {
  if (event.type === 'content:pinned') {
    console.log(`Pinned item in ${event.slot}: ${event.item.id}`);
  }
}
```

## Next

- [Overflow concept](/concepts/overflow) — the strategies that respect pinned items.
- [Events concept](/concepts/events) — the `content:pinned` and `content:evicted` events.
- [Agent with tools](./agent-with-tools) — checkpoint/restore with pinned content.
- [Serialization and checkpoints](./serialization-and-checkpoints) — persisting pinned state.
