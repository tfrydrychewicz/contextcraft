# Debug inspector

The `@slotmux/debug` package ships a local HTTP + WebSocket inspector that visualizes your context in real time. During development, you get live slot utilization bars, a token budget waterfall, a content timeline, snapshot diffs, and a "what-if" simulator — all in a browser UI.

## Installation

```bash
pnpm add @slotmux/debug
```

The package ships the inspector UI as a pre-built static bundle — no additional frontend tooling required.

## Attaching the inspector

Call `attachInspector` with your `Context` instance:

```typescript
import { createContext, Context } from 'slotmux';
import { attachInspector } from '@slotmux/debug';

const { config } = createContext({
  model: 'gpt-4o',
  preset: 'chat',
});
const ctx = Context.fromParsedConfig(config);

// Start the inspector server
const inspector = await attachInspector(ctx, { port: 4200 });
console.log(`Inspector: ${inspector.url}/inspector/`);
// → Inspector: http://127.0.0.1:4200/inspector/
```

Open the URL in your browser to see the live UI.

## Options

```typescript
type AttachInspectorOptions = {
  port?: number;               // TCP port (default 4200). Use 0 for a free port.
  allowInNonDevelopment?: boolean; // Override NODE_ENV guard (default false).
  maxEvents?: number;          // In-memory event ring size (default 500).
};
```

| Option | Default | Purpose |
| --- | --- | --- |
| `port` | 4200 | TCP port for the HTTP/WebSocket server |
| `allowInNonDevelopment` | `false` | Only runs when `NODE_ENV=development` unless overridden |
| `maxEvents` | 500 | Maximum events kept in memory (ring buffer, oldest dropped) |

### Development-only guard

By default, `attachInspector` throws `InspectorDisabledError` if `NODE_ENV` is not `"development"`. This prevents accidentally exposing the inspector in production. Override with:

```typescript
await attachInspector(ctx, { allowInNonDevelopment: true });
```

## Inspector UI panels

The inspector UI at `/inspector/` shows five panels:

### Slot utilization

Horizontal bars showing each slot's token usage vs its budget. Color-coded:

- **Green** — under 60% utilization
- **Yellow** — 60–85%
- **Red** — above 85%

Shows slot name, used tokens, budget tokens, and utilization percentage. Updates live via WebSocket as you push content and call `build()`.

### Token budget waterfall

A stacked bar chart of how the total token budget is distributed across slots. Each slot gets a colored segment proportional to its resolved budget. Helps you spot when one slot dominates the budget or when flex slots are starved.

### Content timeline

A chronological log of all pipeline events. Each event shows:

- **Timestamp** — when the event was received
- **Type** — color-coded by category (content, overflow, build, compression, warning)
- **Summary** — slot name, strategy used, token counts, or warning message

Scroll through the timeline to trace what happened during a build. Filter by event type to focus on overflows, evictions, or builds.

### Snapshot diff viewer

Side-by-side comparison of two consecutive snapshots. Shows:

- Total tokens and utilization delta
- Per-slot budget and usage changes
- Messages added, removed, or modified

Useful for understanding how a single `push()` + `build()` cycle changed the compiled output.

### What-if simulator

Drag sliders to multiply slot budgets and instantly preview how utilization would change. Each slot gets a slider (0.5× to 2.0×) that scales its budget. The utilization bars update in real time without triggering an actual build.

Use this to answer questions like "what if I gave the history slot twice the budget?" or "what if I halved the RAG slot?"

## REST endpoints

The inspector server exposes three REST endpoints alongside the UI:

| Endpoint | Method | Response |
| --- | --- | --- |
| `/snapshot` | GET | Latest serialized snapshot (or `null` before first build) |
| `/slots` | GET | Current slot configs with their content items |
| `/events` | GET | Array of recent events (up to `maxEvents`) |
| `/health` | GET | Server info and available endpoints |

All endpoints return JSON with CORS headers (`Access-Control-Allow-Origin: *`).

```bash
curl http://127.0.0.1:4200/snapshot | jq '.snapshot.meta.utilization'
# → 0.852

curl http://127.0.0.1:4200/slots | jq '.slots | keys'
# → ["history", "system"]

curl http://127.0.0.1:4200/events | jq '.events | length'
# → 42
```

## WebSocket streaming

Connect to the same port with a WebSocket client to receive events in real time:

```typescript
const ws = new WebSocket('ws://127.0.0.1:4200');

ws.addEventListener('message', (msg) => {
  const data = JSON.parse(msg.data);
  if (data.type === 'slotmux:event') {
    console.log(data.event.type, data.event);
  }
});
```

Each WebSocket message is a JSON object with:

```typescript
{
  type: 'slotmux:event',
  event: { type: '...', /* event-specific fields */ }
}
```

Events are the same serialized payloads from the REST `/events` endpoint, delivered as they happen.

## Complete example

```typescript
import { createContext, Context } from 'slotmux';
import { attachInspector } from '@slotmux/debug';

async function main() {
  const { config } = createContext({
    model: 'gpt-4o-mini',
    preset: 'chat',
  });
  const ctx = Context.fromParsedConfig(config);

  const inspector = await attachInspector(ctx, {
    port: 4200,
    allowInNonDevelopment: true,
  });
  console.log(`Inspector running at ${inspector.url}/inspector/`);

  ctx.system('You are a helpful assistant.');
  ctx.user('What is the capital of France?');
  ctx.assistant('The capital of France is Paris.');

  await ctx.build();

  ctx.user('Tell me more about Paris.');
  await ctx.build();

  // Keep the process alive for browsing the inspector
  console.log('Press Ctrl+C to stop.');
}

main().catch(console.error);
```

## Cleanup

The `attachInspector` return value includes a `close()` method that stops the server and unsubscribes from context events:

```typescript
const inspector = await attachInspector(ctx);

// ... later
await inspector.close();
```

Always call `close()` in tests to prevent port leaks and hanging processes.

## Tips

- **Tests**: Use `port: 0` to let the OS pick a free port, then read `inspector.port`.
- **Multiple contexts**: Attach one inspector per context — each gets its own server.
- **Event overflow**: If your app generates thousands of events per second, lower `maxEvents` to reduce memory usage.
- **Production**: Never deploy with the inspector attached. The `NODE_ENV` guard exists for a reason.

## Next

- [Events and observability](./events-and-observability) — metrics and logging without the visual UI.
- [OpenTelemetry](./opentelemetry) — production-grade distributed tracing.
- [Events concept](/concepts/events) — deep dive on event types.
