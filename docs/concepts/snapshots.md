# Snapshots

A **snapshot** is the immutable output of `ctx.build()`. It contains the compiled messages ready for an LLM provider and rich metadata about how the context was assembled.

## What's in a snapshot

```typescript
const { snapshot } = await ctx.build();

snapshot.id;         // unique identifier for this build
snapshot.messages;   // compiled messages (provider-agnostic)
snapshot.meta;       // token counts, utilization, per-slot stats, warnings
snapshot.model;      // model name from the config
snapshot.immutable;  // true by default — messages and meta are frozen
```

### Compiled messages

`snapshot.messages` is an array of `CompiledMessage` objects:

```typescript
interface CompiledMessage {
  role: MessageRole;      // 'system' | 'user' | 'assistant' | 'tool' | 'function'
  content: string | MultimodalContent[];
  name?: string;
  tool_call_id?: string;
  toolUses?: ToolUse[];
}
```

These are provider-agnostic. To send them to an API, use a provider formatter:

```typescript
import { formatOpenAIMessages } from '@slotmux/providers';

const openaiMessages = formatOpenAIMessages(snapshot.messages);
```

### Snapshot metadata

`snapshot.meta` gives you a detailed breakdown of the build:

```typescript
interface SnapshotMeta {
  totalTokens: number;      // tokens used across all slots
  totalBudget: number;      // maxTokens − reserveForResponse
  utilization: number;       // totalTokens / totalBudget (0–1)
  waste: number;             // allocated but unused tokens

  slots: Record<string, SlotMeta>;  // per-slot breakdown
  compressions: CompressionEvent[]; // compression operations that ran
  evictions: EvictionEvent[];       // items removed during overflow
  warnings: ContextWarning[];       // non-fatal issues

  buildTimeMs: number;       // time to run the full pipeline
  builtAt: number;           // timestamp (ms since epoch)
}
```

#### Per-slot metadata

Each entry in `meta.slots` contains:

```typescript
interface SlotMeta {
  name: string;
  budgetTokens: number;     // tokens allocated to this slot
  usedTokens: number;       // tokens actually used
  itemCount: number;         // number of content items
  evictedCount: number;      // items removed by overflow
  overflowTriggered: boolean; // whether overflow ran for this slot
  utilization: number;       // usedTokens / budgetTokens
}
```

#### Warnings

Warnings surface non-fatal issues without interrupting the build:

```typescript
interface ContextWarning {
  code: string;        // e.g. 'SLOT_PROTECTED_OVER_BUDGET'
  message: string;
  slot?: string;
  severity: 'low' | 'medium' | 'high';
}
```

## Immutability

By default, snapshots are deeply frozen using `Object.freeze()`. This means:

- **`snapshot.messages`** — The array and each individual message are frozen.
- **`snapshot.meta`** — The entire metadata tree is frozen.
- Attempting to mutate any property throws a `TypeError` in strict mode (and silently fails otherwise).

This makes snapshots safe to share across threads, cache in a `Map`, or store for later diffing — you're guaranteed the data won't change underneath you.

To disable freezing (for performance-critical paths where you know you won't mutate):

```typescript
const { config } = createContext({
  model: 'gpt-4o-mini',
  preset: 'chat',
  immutableSnapshots: false,
});
```

## Diffing

Compare two snapshots to see what changed between builds:

```typescript
const { snapshot: snap1 } = await ctx.build();

ctx.user('Another message');
const { snapshot: snap2 } = await ctx.build();

const diff = snap2.diff(snap1);
```

The diff contains:

```typescript
interface SnapshotDiff {
  added: CompiledMessage[];     // messages in snap2 but not snap1
  removed: CompiledMessage[];   // messages in snap1 but not snap2
  modified: Array<{             // messages that changed content
    index: number;
    before: CompiledMessage;
    after: CompiledMessage;
  }>;
  slotsModified: string[];      // slot names where SlotMeta changed
}
```

Diffing is useful for debugging context growth, logging what changed between turns, or implementing incremental caching strategies.

## Serialization

Snapshots can be serialized for storage, transport, or replay:

```typescript
const data = snapshot.serialize();
// data is a plain object with version, id, model, messages, meta, checksum

const json = JSON.stringify(data);
```

Deserialization verifies a SHA-256 checksum to detect tampering:

```typescript
const restored = ContextSnapshot.deserialize(JSON.parse(json));
```

The serialized format includes a `version` field (`'1.0'`) for forward compatibility. When the format evolves, `ContextSnapshot.migrate()` handles upgrading old snapshots.

### Wire format

```typescript
interface SerializedSnapshot {
  version: '1.0';
  id: string;
  model: string;
  slots: Record<string, SlotMeta>;
  messages: CompiledMessage[];
  meta: SnapshotMeta;
  checksum: string;   // SHA-256 of the canonical content
}
```

## Structural sharing

When building multiple snapshots from the same context (e.g. successive conversation turns), slotmux can reuse unchanged compiled messages from a previous snapshot instead of creating new objects:

```typescript
const { snapshot: snap1 } = await ctx.build();

ctx.user('New message');
const { snapshot: snap2 } = await ctx.build({
  previousSnapshot: snap1,
  structuralSharing: true,
});
// snap2.messages[0] === snap1.messages[0]  (same object reference for unchanged system prompt)
```

This reduces GC pressure and makes equality checks faster.

## Next

- [Slots](./slots) — how to define the structure that snapshots compile.
- [Budgets](./budgets) — how token allocations feed into snapshot metadata.
- [Overflow](./overflow) — how overflow decisions appear in evictions and warnings.
