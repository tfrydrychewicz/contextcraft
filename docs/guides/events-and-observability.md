# Events and observability

Slotmux emits structured events at every stage of the build pipeline. This guide shows how to subscribe to events, extract metrics, integrate with structured logging, and build production monitoring — all without touching the context assembly logic.

## Subscribing to events

Pass an `onEvent` callback in your context config:

```typescript
import { createContext, Context } from 'slotmux';

const { config } = createContext({
  model: 'gpt-4o',
  preset: 'chat',
  onEvent(event) {
    console.log(`[${event.type}]`, event);
  },
});

const ctx = Context.fromParsedConfig(config);
```

The callback receives every event — content mutations, budget resolution, overflow, compression, and build completion. Events are delivered synchronously before the next pipeline step runs.

## Filtering by event type

`ContextEvent` is a discriminated union. Use `event.type` to narrow and handle only what you care about:

```typescript
onEvent(event) {
  switch (event.type) {
    case 'content:added':
      console.log(`Added to "${event.slot}": ${event.item.content}`);
      break;
    case 'content:evicted':
      console.log(`Evicted from "${event.slot}": ${event.reason}`);
      break;
    case 'slot:overflow':
      console.warn(`Overflow in "${event.slot}": ${event.beforeTokens} → ${event.afterTokens} via ${event.strategy}`);
      break;
    case 'build:complete':
      console.log(`Build done: ${event.snapshot.meta.utilization * 100}% utilization`);
      break;
  }
}
```

TypeScript narrows each branch to the correct event interface — `event.slot`, `event.strategy`, `event.snapshot`, etc. are type-safe.

## All 10 event types

| Type | Category | Fires when | Key fields |
| --- | --- | --- | --- |
| `content:added` | Content | `ctx.user()`, `ctx.push()`, etc. | `slot`, `item` |
| `content:evicted` | Content | Overflow removes an item | `slot`, `item`, `reason` |
| `content:pinned` | Content | `ctx.pin()` marks an item | `slot`, `item` |
| `slot:budget-resolved` | Budget | Allocator assigns tokens to a slot | `slot`, `budgetTokens` |
| `slot:overflow` | Overflow | Strategy runs on a slot | `slot`, `strategy`, `beforeTokens`, `afterTokens` |
| `compression:start` | Compression | A compressor begins | `slot`, `itemCount` |
| `compression:complete` | Compression | Compression finishes | `slot`, `beforeTokens`, `afterTokens`, `ratio` |
| `build:start` | Build | `build()` or `buildStream()` starts | `totalBudget` |
| `build:complete` | Build | Build produces a snapshot | `snapshot` (full `ContextSnapshot`) |
| `warning` | Diagnostic | Non-fatal issue detected | `warning` with `code`, `message`, `severity` |

Content events fire immediately on mutation. Build-related events fire during `build()` / `buildStream()`.

## Building metrics from events

### Utilization gauge

Track how full the context window is after each build:

```typescript
import { createContext, Context, type ContextEvent } from 'slotmux';

function handleEvent(event: ContextEvent) {
  if (event.type === 'build:complete') {
    const { utilization, totalTokens, totalBudget, buildTimeMs } = event.snapshot.meta;
    metrics.gauge('slotmux.utilization', utilization);
    metrics.gauge('slotmux.tokens.used', Number(totalTokens));
    metrics.gauge('slotmux.tokens.budget', Number(totalBudget));
    metrics.histogram('slotmux.build.duration_ms', buildTimeMs);
  }
}
```

### Overflow counter

Count overflows per slot and strategy:

```typescript
if (event.type === 'slot:overflow') {
  metrics.increment('slotmux.overflow.count', {
    slot: event.slot,
    strategy: event.strategy,
  });
  metrics.histogram('slotmux.overflow.tokens_freed',
    event.beforeTokens - event.afterTokens,
    { slot: event.slot },
  );
}
```

### Compression ratio tracker

Monitor how effectively compression reduces token usage:

```typescript
if (event.type === 'compression:complete') {
  metrics.histogram('slotmux.compression.ratio', event.ratio, {
    slot: event.slot,
  });
  metrics.histogram('slotmux.compression.tokens_saved',
    event.beforeTokens - event.afterTokens,
    { slot: event.slot },
  );
}
```

### Eviction tracker

Detect content loss from overflow:

```typescript
if (event.type === 'content:evicted') {
  metrics.increment('slotmux.content.evicted', { slot: event.slot });
}
```

### Per-slot budget resolution

Capture how tokens are distributed across slots:

```typescript
if (event.type === 'slot:budget-resolved') {
  metrics.gauge('slotmux.slot.budget', event.budgetTokens, {
    slot: event.slot,
  });
}
```

## Structured logging

Slotmux ships a composable logging system. Loggers can be layered: console → leveled → scoped → redacting.

### Console logger

The simplest setup:

```typescript
import { createConsoleLogger, createContext } from 'slotmux';

const { config } = createContext({
  model: 'gpt-4o',
  preset: 'chat',
  logger: createConsoleLogger({ prefix: '[slotmux]' }),
});
```

Output:

```
[slotmux] [debug] Budget resolved: system=2000, history=121904
[slotmux] [info]  Build complete in 3ms (85.2% utilization)
```

### Log levels

Control verbosity with `LogLevel`:

```typescript
import { LogLevel, createConsoleLogger, createLeveledLogger, createContext } from 'slotmux';

const console = createConsoleLogger({ prefix: '[slotmux]' });
const leveled = createLeveledLogger(console, LogLevel.WARN);

const { config } = createContext({
  model: 'gpt-4o',
  logger: leveled,
  logLevel: LogLevel.WARN,
});
```

| Level | Value | Shows |
| --- | --- | --- |
| `SILENT` | -1 | Nothing |
| `ERROR` | 0 | Errors only |
| `WARN` | 1 | Errors + warnings |
| `INFO` | 2 | Errors + warnings + info (default) |
| `DEBUG` | 3 | All above + debug |
| `TRACE` | 4 | Everything (disables event redaction) |

### Scoped logger

Add subsystem labels:

```typescript
import { createConsoleLogger, createScopedLogger } from 'slotmux';

const base = createConsoleLogger();
const overflow = createScopedLogger(base, 'overflow');
overflow.info('Processing history slot');
// → [slotmux:overflow] Processing history slot
```

### Contextual logger

Add per-build operation context:

```typescript
import { createContextualLogger, newBuildOperationId } from 'slotmux';

const contextual = createContextualLogger(base, {
  operationId: newBuildOperationId(),
  slot: 'history',
});
contextual.debug('Evicting oldest 3 items');
// → [op=abc123 slot=history] Evicting oldest 3 items
```

### Redacting logger

Automatically redact PII from log messages and arguments:

```typescript
import { createRedactingLogger, createConsoleLogger } from 'slotmux';

const redacting = createRedactingLogger({
  delegate: createConsoleLogger(),
  redaction: true,
});
redacting.info('User email: john@example.com, SSN: 123-45-6789');
// → User email: [REDACTED], SSN: [REDACTED]
```

### Plugin logger factory

Give each plugin its own scoped, leveled, optionally redacting logger:

```typescript
import { createPluginLoggerFactory, LogLevel } from 'slotmux';

const factory = createPluginLoggerFactory({
  level: LogLevel.DEBUG,
  consolePrefix: '[slotmux]',
  redaction: true,
});
// factory('my-plugin') → [slotmux] [slotmux:my-plugin] ...
```

## Composing loggers

Loggers are plain objects with `trace`, `debug`, `info`, `warn`, `error` methods. You can compose them in any order:

```typescript
import {
  createConsoleLogger,
  createLeveledLogger,
  createScopedLogger,
  createRedactingLogger,
  LogLevel,
} from 'slotmux';

const logger = createRedactingLogger({
  delegate: createLeveledLogger(
    createScopedLogger(
      createConsoleLogger({ prefix: '[app]' }),
      'slotmux',
    ),
    LogLevel.INFO,
  ),
  redaction: true,
});
```

Or bring your own logger — any object with the five methods works. Integrate with winston, pino, Bunyan, or any other library:

```typescript
import pino from 'pino';

const pinoLogger = pino({ name: 'slotmux' });
const logger = {
  trace: (msg: string, ...args: unknown[]) => pinoLogger.trace(msg, ...args),
  debug: (msg: string, ...args: unknown[]) => pinoLogger.debug(msg, ...args),
  info: (msg: string, ...args: unknown[]) => pinoLogger.info(msg, ...args),
  warn: (msg: string, ...args: unknown[]) => pinoLogger.warn(msg, ...args),
  error: (msg: string, ...args: unknown[]) => pinoLogger.error(msg, ...args),
};
```

## Event redaction

By default, event payloads delivered to `onEvent` and loggers are **redacted** — PII patterns (emails, SSNs, credit card numbers) are replaced with `[REDACTED]`. Content sent to the LLM is never affected.

| Config | Behavior |
| --- | --- |
| Omitted | Redaction on (default patterns) |
| `redaction: true` | Redaction on (default patterns) |
| `redaction: { patterns: [...], replacement: '***' }` | Custom patterns |
| `redaction: false` | Redaction off |
| `logLevel: LogLevel.TRACE` | Redaction off (full observability) |

```typescript
createContext({
  model: 'gpt-4o',
  redaction: {
    patterns: [/\bAPI_KEY_\w+/g, /Bearer\s+\S+/g],
    replacement: '[HIDDEN]',
  },
});
```

Default patterns match:

- US SSN format (`\d{3}-\d{2}-\d{4}`)
- Email addresses
- 16-digit card numbers (Visa/MC/Discover)
- 15-digit Amex numbers (3[47]...)

## Linking events to application traces

Assign each build a unique operation ID for correlation:

```typescript
import { newBuildOperationId } from 'slotmux';

const operationId = newBuildOperationId();

onEvent(event) {
  logger.info(`[op=${operationId}]`, event.type, event);
}
```

`newBuildOperationId()` returns a UUID when `crypto.randomUUID` is available (Node 19+, all modern browsers), otherwise a timestamp-based fallback.

For full distributed tracing, see the [OpenTelemetry guide](./opentelemetry).

## Production monitoring checklist

A recommended set of metrics for production:

| Metric | Event source | Alert threshold |
| --- | --- | --- |
| Context utilization | `build:complete` → `meta.utilization` | > 0.95 (near overflow) |
| Build latency | `build:complete` → `meta.buildTimeMs` | p99 > 50ms |
| Overflow rate | `slot:overflow` count per minute | Sudden spikes |
| Eviction rate | `content:evicted` count | > 0 in protected slots |
| Compression ratio | `compression:complete` → `ratio` | < 0.3 (heavy loss) |
| Warning count | `warning` events | Any `severity: 'error'` |

## Next

- [Events concept](/concepts/events) — deep dive on event types and the emitter.
- [Debug inspector](./debug-inspector) — visual UI for development-time debugging.
- [OpenTelemetry](./opentelemetry) — spans, metrics, and distributed tracing.
- [Plugins concept](/concepts/plugins) — building plugins that subscribe to `onEvent`.
