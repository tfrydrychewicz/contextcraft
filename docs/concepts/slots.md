# Slots

A **slot** is a named partition of the context window. Each slot has its own token budget, overflow strategy, compile position, and default message role. Slots let you structure a prompt into logical sections — system instructions, conversation history, retrieved documents, tool outputs — and manage each one independently.

## Anatomy of a slot

Every slot is described by a `SlotConfig`:

```typescript
interface SlotConfig {
  priority: number;             // 1–100, higher = more important
  budget: SlotBudget;           // how many tokens this slot gets
  overflow?: SlotOverflowStrategy; // what happens when it's full
  overflowConfig?: OverflowConfig; // strategy-specific knobs
  position?: 'before' | 'after' | 'interleave'; // compile order
  order?: number;               // tie-break for interleave position
  maxItems?: number;            // hard cap on number of items
  protected?: boolean;          // exempt from all overflow
  defaultRole?: MessageRole;    // role assigned when pushing plain strings
}
```

| Field | Purpose |
| --- | --- |
| `priority` | Determines budget allocation order (higher first) and overflow processing order (lower first). |
| `budget` | Token allocation — `fixed`, `percent`, `flex`, or bounded flex. See [Budgets](./budgets). |
| `overflow` | Strategy when content exceeds the budget. See [Overflow](./overflow). Defaults to `'truncate'`. |
| `position` | Where this slot's messages appear in the compiled output. `before` slots come first, then `interleave`, then `after`. |
| `maxItems` | Independent of token budget — caps the number of content items in the slot (default 10 000). |
| `protected` | Over-budget content is never evicted; a warning is emitted instead. |
| `defaultRole` | Role assigned to items pushed without an explicit role (`'system'`, `'user'`, `'assistant'`, `'tool'`, `'function'`). |

## Presets

Slotmux ships three presets that define common slot layouts:

### `chat`

Two slots for a simple conversational interface.

| Slot | Priority | Budget | Position | Role | Overflow |
| --- | --- | --- | --- | --- | --- |
| `system` | 100 | fixed 2 000 | before | `system` | `error` |
| `history` | 50 | flex | after | `user` | `summarize` |

### `rag`

Four slots for retrieval-augmented generation.

| Slot | Priority | Budget | Position | Role | Overflow |
| --- | --- | --- | --- | --- | --- |
| `system` | 100 | fixed 2 000 | before | `system` | `error` |
| `rag` | 80 | 40 % | before | `user` | `semantic` |
| `history` | 50 | flex | after | `user` | `truncate` |
| `output` | 90 | fixed 4 000 | after | `assistant` | `error` |

### `agent`

Four slots for tool-calling agent loops.

| Slot | Priority | Budget | Position | Role | Overflow |
| --- | --- | --- | --- | --- | --- |
| `system` | 100 | fixed 2 000 | before | `system` | `error` |
| `tools` | 90 | 20 % | before | `function` | `error` |
| `scratchpad` | 70 | flex | interleave | `assistant` | `truncate` |
| `history` | 50 | flex | after | `user` | `sliding-window` |

### Custom slots

Pass `slots` to `createContext` to define your own layout, or combine with a preset to override specific slots:

```typescript
const { config } = createContext({
  model: 'gpt-4o-mini',
  preset: 'chat',
  slots: {
    history: {
      priority: 50,
      budget: { flex: true },
      overflow: 'truncate',
      defaultRole: 'user',
      position: 'after',
    },
  },
});
```

When both `preset` and `slots` are provided, custom slots override preset slots by name — unmentioned preset slots are kept.

## Pushing content into slots

The `Context` class provides convenience methods that target the right slot automatically:

```typescript
const ctx = Context.fromParsedConfig(config);

ctx.system('You are a helpful assistant.');   // → system slot, role: system
ctx.user('Hello!');                            // → history slot, role: user
ctx.assistant('Hi there!');                    // → history slot, role: assistant
```

For custom slots or batch inserts, use `push()`:

```typescript
ctx.push('rag', [
  { content: 'Document 1 text...', role: 'user' },
  { content: 'Document 2 text...', role: 'user' },
]);
```

When you push a plain string without a role, the slot's `defaultRole` is used.

## Priority and ordering

Priority serves two distinct purposes:

1. **Budget allocation** — Slots are resolved in **priority-descending** order. Higher-priority slots get their budget first; flex slots share whatever remains.

2. **Overflow processing** — The overflow engine processes slots in **priority-ascending** order. Lower-priority slots are trimmed first, preserving the most important content.

### Compile order

The final message array is assembled by `position`:

1. **`before`** slots — sorted by priority descending
2. **`interleave`** slots — sorted by `order` ascending, then priority descending
3. **`after`** slots — sorted by priority descending

Within each group, ties are broken alphabetically by slot name.

## The SlotManager

Under the hood, slots are tracked by a `SlotManager` instance. You rarely interact with it directly, but it's useful for advanced scenarios:

```typescript
import { SlotManager } from 'slotmux';

const manager = new SlotManager();
manager.registerSlot('system', { priority: 100, budget: { fixed: 2000 } });
manager.registerSlot('history', { priority: 50, budget: { flex: true } });

manager.listSlots();    // sorted by priority descending
manager.getSlot('system'); // shallow copy of SlotConfig
manager.updateSlot('history', { priority: 60 });
manager.removeSlot('history');
```

## Next

- [Budgets](./budgets) — how token budgets are allocated across slots.
- [Overflow](./overflow) — what happens when a slot exceeds its budget.
