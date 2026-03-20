# Security and redaction

Slotmux includes defense-in-depth features for production deployments: PII redaction in logs and events, prompt injection heuristics, integrity verification on deserialized snapshots, and resource limits per slot.

## Content redaction

By default, event payloads delivered to `onEvent` and log output are **redacted** — PII patterns are replaced with `[REDACTED]`. The actual context sent to the LLM is never modified.

### Default patterns

Slotmux ships four built-in patterns:

| Pattern | Matches |
| --- | --- |
| `\b\d{3}-\d{2}-\d{4}\b` | US Social Security Numbers |
| `\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b` | Email addresses |
| `\b(?:\d{4}[-\s]?){3}\d{4}\b` | 16-digit card numbers (Visa, MC, Discover) |
| `\b3[47]\d{13}\b` | 15-digit Amex numbers |

### Controlling redaction

```typescript
import { createContext } from 'slotmux';

// Default: redaction on with built-in patterns
createContext({ model: 'gpt-5.4' });

// Explicit on
createContext({ model: 'gpt-5.4', redaction: true });

// Custom patterns
createContext({
  model: 'gpt-5.4',
  redaction: {
    patterns: [
      /\bAPI_KEY_\w+/g,
      /Bearer\s+\S+/g,
      /\b\d{3}-\d{2}-\d{4}\b/g,  // keep SSN from defaults
    ],
    replacement: '[HIDDEN]',
  },
});

// Disable redaction
createContext({ model: 'gpt-5.4', redaction: false });
```

### Full observability mode

Setting `logLevel: LogLevel.TRACE` disables redaction entirely, giving you raw event payloads and log messages. Use this only in secure development environments:

```typescript
import { LogLevel, createConsoleLogger } from 'slotmux';

createContext({
  model: 'gpt-5.4',
  logger: createConsoleLogger(),
  logLevel: LogLevel.TRACE,  // disables redaction
});
```

### What gets redacted

| Data | Redacted? |
| --- | --- |
| Event payloads (`onEvent`) | Yes (by default) |
| Logger output | Yes (with `createRedactingLogger`) |
| Inspector events (WebSocket / REST) | Yes (same pipeline as `onEvent`) |
| Context content (sent to LLM) | **No** — never modified |
| Snapshot `.serialize()` output | **No** — exact content preserved |

## Prompt injection protection

The `sanitizePlugin` strips common prompt injection patterns from compiled messages before they reach the LLM:

```typescript
import { createContext, sanitizePlugin } from 'slotmux';

const { config } = createContext({
  model: 'gpt-5.4',
  preset: 'chat',
  plugins: [sanitizePlugin()],
});
```

### Default injection patterns

The plugin catches these English-centric heuristics:

| Pattern | Catches |
| --- | --- |
| `ignore all previous instructions` | Classic instruction override |
| `ignore any instructions/prompts/rules` | Broader variants |
| `disregard all/any/previous instructions` | Synonym variant |
| `you are now "DAN"` | Jailbreak role assignment |
| `system:` | Inline system prompt injection |
| `[INST]`, `<\|im_start\|>`, `<\|im_end\|>` | Chat template delimiter injection |

### Custom patterns

Add patterns specific to your threat model:

```typescript
sanitizePlugin({
  extraPatterns: [
    /\bact as\s+(?:a\s+)?(?:different|new|another)\s+(?:AI|assistant|model)\b/gi,
    /\boverride\s+(?:your|the)\s+(?:instructions?|rules?|guidelines?)\b/gi,
  ],
  replacement: ' ',  // default: collapse to single space
});
```

### How it works

The plugin implements `beforeSnapshot` — it runs after overflow resolution but before the snapshot is finalized. It clones each compiled message and applies regex replacements to all string content (including text blocks in multimodal messages). The original `ContentItem` values in the context are unchanged.

### Limitations

Regex-based sanitization is a **heuristic layer**, not a guarantee. Sophisticated adversaries can encode injections in ways that bypass pattern matching. Use sanitization alongside:

- Model-level system prompt hardening.
- Input validation at the application layer.
- Rate limiting and abuse detection.
- Content filtering APIs from your LLM provider.

## Snapshot integrity

Serialized snapshots include a SHA-256 checksum. On deserialization, the checksum is verified automatically:

```typescript
import { ContextSnapshot, SnapshotCorruptedError } from 'slotmux';

try {
  const snapshot = ContextSnapshot.deserialize(untrustedData);
} catch (err) {
  if (err instanceof SnapshotCorruptedError) {
    // Data was tampered with or corrupted
    console.error('Snapshot integrity check failed');
  }
}
```

This protects against:
- Corruption during network transit or storage.
- Incomplete writes (process crash mid-save).
- Intentional tampering in untrusted environments.

Always validate deserialized snapshots when loading from external sources (databases, caches, user input).

## Authoritative token counts

For billing-sensitive or safety-critical applications, ensure token counts come from a real tokenizer — not character estimation:

```typescript
createContext({
  model: 'gpt-5.4',
  requireAuthoritativeTokenCounts: true,
});
```

When enabled, `build()` and `buildStream()` throw if no `tokenAccountant` is configured and the pipeline would fall back to character estimation for totals. This prevents scenarios where inaccurate counts let a prompt exceed the model's context window.

## Resource limits

### Per-slot item limits

Every slot has a `maxItems` cap (default 10,000) to prevent memory exhaustion:

```typescript
createContext({
  model: 'gpt-5.4',
  slots: {
    history: {
      priority: 50,
      budget: { flex: true },
      maxItems: 5000,  // custom limit
      overflow: 'sliding-window',
    },
  },
});
```

When a slot reaches `maxItems`, pushing additional items throws `MaxItemsExceededError`.

### Early warning at 80%

When a slot reaches 80% of its `maxItems` limit, slotmux emits a `warning` event with code `SLOT_ITEMS_NEAR_LIMIT`:

```typescript
onEvent(event) {
  if (event.type === 'warning' && event.warning.code === 'SLOT_ITEMS_NEAR_LIMIT') {
    console.warn(event.warning.message);
    // → Slot "history" has 8000 items (≥80% of effective maxItems=10000)
  }
}
```

This gives you time to react — evict old items, increase the limit, or switch to an overflow strategy that manages the count automatically.

## Supply chain security

Slotmux follows security best practices for npm packages:

- **Minimal runtime dependencies** — core has zero production dependencies. Tokenizer packages are peer dependencies you install explicitly.
- **npm provenance** — packages are published with provenance attestation linking builds to source commits.
- **`pnpm audit`** — run as part of CI to catch known vulnerabilities in the dependency tree.
- **No eval / dynamic code** — the library never evaluates user-supplied strings as code.

## Security checklist

| Check | Default | Action |
| --- | --- | --- |
| Event/log redaction | On | Keep on in production; customize patterns for your data |
| Prompt injection sanitization | Off | Enable `sanitizePlugin()` for user-facing applications |
| Snapshot checksums | Automatic | Always validate when deserializing from untrusted sources |
| Authoritative token counts | Off | Enable for billing/safety-critical paths |
| Slot `maxItems` | 10,000 | Lower for slots with untrusted input |
| Tokenizer peers | Strict | Keep `strictTokenizerPeers: true` (default) in production |

## Next

- [Events concept](/concepts/events) — event redaction details.
- [Error handling](./error-handling) — the full error hierarchy.
- [Serialization & checkpoints](./serialization-and-checkpoints) — snapshot integrity in depth.
- [Plugins concept](/concepts/plugins) — how `sanitizePlugin` hooks into the pipeline.
