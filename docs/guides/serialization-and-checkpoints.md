# Serialization and checkpoints

Slotmux provides two complementary persistence mechanisms: **snapshot serialization** for saving compiled build results, and **checkpoints** for saving and restoring mutable context state. Together they enable session persistence, replay, rollback, and migration.

## Snapshot serialization

After `build()`, the `ContextSnapshot` can be serialized to a JSON-safe object:

```typescript
const { snapshot } = await ctx.build();

const serialized = snapshot.serialize();
// → { version: '1.0', id, model, slots, messages, meta, checksum }
```

### `SerializedSnapshot` shape

```typescript
interface SerializedSnapshot {
  version: '1.0';
  id: string;
  model: ModelId;
  slots: Record<string, SerializedSlot>;
  messages: SerializedMessage[];
  meta: SnapshotMeta;
  checksum: string;  // SHA-256 of the serialized content
}
```

Everything is JSON-safe — no functions, no circular references, no class instances. You can `JSON.stringify()` it directly.

### Integrity checksum

Every serialized snapshot includes a SHA-256 `checksum` computed over the content. On deserialization, the checksum is verified:

```typescript
const restored = ContextSnapshot.deserialize(serialized);
// Throws SnapshotCorruptedError if checksum doesn't match
```

This catches:
- Accidental corruption in transit or storage.
- Incomplete writes (e.g. process crash mid-save).
- Tampered data in untrusted environments.

### Persisting to storage

```typescript
// Save to file
import { writeFile, readFile } from 'node:fs/promises';

await writeFile('session.json', JSON.stringify(snapshot.serialize()));

// Load from file
const data = JSON.parse(await readFile('session.json', 'utf-8'));
const restored = ContextSnapshot.deserialize(data);
```

```typescript
// Save to Redis
await redis.set(`session:${userId}`, JSON.stringify(snapshot.serialize()));

// Load from Redis
const raw = await redis.get(`session:${userId}`);
const restored = ContextSnapshot.deserialize(JSON.parse(raw));
```

```typescript
// Save to a database (e.g. PostgreSQL JSONB)
await db.query(
  'INSERT INTO sessions (user_id, snapshot) VALUES ($1, $2)',
  [userId, JSON.stringify(snapshot.serialize())],
);
```

## Snapshot diffing

Compare two snapshots to see what changed:

```typescript
const { snapshot: before } = await ctx.build();

ctx.user('Another message');
const { snapshot: after } = await ctx.build();

const diff = before.diff(after);
```

### `SnapshotDiff` shape

```typescript
interface SnapshotDiff {
  added: readonly CompiledMessage[];     // Messages in `after` beyond `before`
  removed: readonly CompiledMessage[];   // Messages in `before` beyond `after`
  modified: readonly {
    index: number;
    before: CompiledMessage;
    after: CompiledMessage;
  }[];                                    // Same index, different content
  slotsModified: readonly SnapshotSlotMetaDiff[];
}
```

The diff uses append-only semantics:
- `added` — trailing messages in `after` that extend beyond `before.messages.length`.
- `removed` — trailing messages in `before` that extend beyond `after.messages.length`.
- `modified` — messages at the same index with different serialized content.
- `slotsModified` — slots present in both snapshots where any metadata field differs (budget, usage, overflow state).

### Practical use cases for diffing

**Change logging:**

```typescript
const diff = previous.diff(current);
if (diff.added.length > 0) {
  console.log(`${diff.added.length} new messages`);
}
for (const mod of diff.slotsModified) {
  console.log(`Slot "${mod.name}": ${mod.before.usedTokens} → ${mod.after.usedTokens} tokens`);
}
```

**Incremental sync** — send only the delta to a client instead of the full snapshot:

```typescript
const diff = lastSentSnapshot.diff(currentSnapshot);
ws.send(JSON.stringify({ type: 'snapshot:diff', diff }));
```

## Checkpoints

While snapshots capture the **compiled output**, checkpoints capture the **mutable input** — the content items in each slot before a build. Use checkpoints for rollback in agent loops, undo/redo, and branch-and-merge exploration.

### Creating a checkpoint

```typescript
const cp = ctx.checkpoint();
```

### `ContextCheckpoint` shape

```typescript
type ContextCheckpoint = {
  version: '1.0';
  seq: number;                          // Monotonic counter per context instance
  changedSincePrevious: readonly string[];  // Slots that changed since last checkpoint
  slots: Readonly<Record<string, readonly ContentItem[]>>;
};
```

| Field | Purpose |
| --- | --- |
| `seq` | Increments on each `checkpoint()` call. Useful for ordering. |
| `changedSincePrevious` | Delta encoding — only slot names whose items changed since the last `checkpoint()`. |
| `slots` | Full deep copy of every registered slot's content items. |

### Restoring from a checkpoint

```typescript
ctx.restore(cp);
```

This replaces all slot contents with the checkpoint's state and resets the internal baseline so the next `checkpoint()` diffs from the restored state.

### Agent loop rollback

In agent systems, the LLM may take a wrong path. Checkpoint before each tool call and roll back on failure:

```typescript
async function agentLoop(ctx: Context) {
  while (true) {
    const cp = ctx.checkpoint();

    const { snapshot } = await ctx.build();
    const toolCall = await callLLM(snapshot);

    if (toolCall === null) break;

    try {
      const result = await executeTool(toolCall);
      ctx.push('tools', [{ content: JSON.stringify(result), role: 'tool' }]);
    } catch (err) {
      // Roll back to before this failed tool call
      ctx.restore(cp);
      ctx.push('tools', [{
        content: `Tool "${toolCall.name}" failed: ${err.message}`,
        role: 'tool',
      }]);
    }
  }
}
```

### Delta encoding

The `changedSincePrevious` field tells you which slots were modified since the last checkpoint — useful for efficient persistence:

```typescript
const cp1 = ctx.checkpoint();
ctx.user('New message');
const cp2 = ctx.checkpoint();

console.log(cp2.changedSincePrevious);
// → ['history']  — only the history slot changed
```

If `changedSincePrevious` is empty, nothing changed since the last checkpoint.

## Snapshot migration

When your context layout changes between versions (renamed slots, changed budgets), `ContextSnapshot.migrate()` transforms a serialized snapshot to the new format:

```typescript
const migrated = ContextSnapshot.migrate(oldSerialized, {
  version: '1.0',
  transforms: {
    // Rename a slot
    slots: (slots) => {
      if ('conversation' in slots) {
        slots['history'] = slots['conversation'];
        delete slots['conversation'];
      }
      return slots;
    },
  },
});

const snapshot = ContextSnapshot.deserialize(migrated);
```

Use this when you need to load sessions from a previous version of your application.

## Combining snapshots and checkpoints

| Feature | Snapshot (`.serialize()`) | Checkpoint (`.checkpoint()`) |
| --- | --- | --- |
| What it captures | Compiled messages + metadata | Raw content items per slot |
| Immutable | Yes (frozen) | Yes (deep copy) |
| Integrity check | SHA-256 checksum | None |
| Restore target | New `ContextSnapshot` | Same `Context` instance |
| Use case | Persistence, analytics, sync | Rollback, undo, branching |

A typical flow:

1. **Checkpoint** before risky operations (tool calls, user actions).
2. **Restore** on failure.
3. **Build** to get a new snapshot.
4. **Serialize** the snapshot for long-term storage.

## Next

- [Snapshots concept](/concepts/snapshots) — immutability, metadata, and format options.
- [Agent with tools](./agent-with-tools) — checkpoint/restore in agent loops.
- [Streaming build](./streaming-build) — progressive build delivery.
