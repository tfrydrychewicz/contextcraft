# OpenTelemetry

The `@slotmux/plugin-otel` package bridges slotmux's event system to OpenTelemetry, emitting spans for builds, overflows, and compressions, plus histograms for utilization, token usage, and build duration. Drop it into your app to get production-grade traces and metrics from context assembly.

## Installation

```bash
pnpm add @slotmux/plugin-otel @opentelemetry/api
```

You also need an OpenTelemetry SDK for traces and metrics to export. For Node.js:

```bash
pnpm add @opentelemetry/sdk-node @opentelemetry/sdk-trace-node @opentelemetry/sdk-metrics
```

The plugin uses `@opentelemetry/api` only — it works with any SDK or collector setup.

## Setup

Register the plugin with `createContext`:

```typescript
import { createContext, Context } from 'slotmux';
import { otelPlugin } from '@slotmux/plugin-otel';

const { config } = createContext({
  model: 'gpt-4o',
  preset: 'chat',
  plugins: [
    otelPlugin({ serviceName: 'my-chatbot' }),
  ],
});

const ctx = Context.fromParsedConfig(config);
```

That's it. Every `build()` now emits spans and records metrics.

## Options

```typescript
type OtelPluginOptions = {
  serviceName?: string;       // Sets service.name on the root build span.
  parentContext?: OtelContext; // Parent context for trace propagation.
  tracer?: Tracer;            // Override tracer (default: trace.getTracer('slotmux')).
  meter?: Meter;              // Override meter (default: metrics.getMeter('slotmux')).
};
```

| Option | Default | Purpose |
| --- | --- | --- |
| `serviceName` | — | Convenience attribute on the root span. Prefer configuring `Resource` on your SDK. |
| `parentContext` | Active context | Pass an extracted context (e.g. from `propagation.extract`) to link to incoming HTTP traces. |
| `tracer` | `trace.getTracer('slotmux')` | Use your own tracer instance. |
| `meter` | `metrics.getMeter('slotmux')` | Use your own meter instance. |

## Emitted spans

The plugin creates spans from pipeline events:

| Span name | When | Attributes |
| --- | --- | --- |
| `slotmux.build` | `build:start` → `build:complete` | `slotmux.total_budget`, `slotmux.build_time_ms`, `slotmux.utilization`, `slotmux.total_tokens`, `slotmux.message_count` |
| `slotmux.overflow` | `slot:overflow` | `slotmux.slot`, `slotmux.strategy`, `slotmux.before_tokens`, `slotmux.after_tokens` |
| `slotmux.compress` | `compression:start` → `compression:complete` | `slotmux.slot`, `slotmux.item_count`, `slotmux.before_tokens`, `slotmux.after_tokens`, `slotmux.ratio` |

### Span hierarchy

```
slotmux.build
├── slotmux.overflow  (one per overflowing slot)
└── slotmux.compress  (one per compression, nested in build)
```

`slotmux.overflow` and `slotmux.compress` are children of the active `slotmux.build` span.

## Emitted metrics

Three histograms are recorded after each build:

| Metric name | Unit | Description |
| --- | --- | --- |
| `slotmux.build.duration` | ms | Wall-clock time of `build()` |
| `slotmux.utilization` | ratio (0–1) | Snapshot utilization after build |
| `slotmux.tokens.used` | tokens | Total tokens in the compiled snapshot |

These come from `build:complete` event data (`meta.buildTimeMs`, `meta.utilization`, `meta.totalTokens`).

## Trace propagation

To link slotmux traces to an incoming HTTP request, extract the parent context and pass it to the plugin:

```typescript
import { propagation, context as otelContext } from '@opentelemetry/api';
import { otelPlugin } from '@slotmux/plugin-otel';

function handleRequest(req: IncomingMessage) {
  const parentCtx = propagation.extract(otelContext.active(), req.headers);

  const { config } = createContext({
    model: 'gpt-4o',
    preset: 'chat',
    plugins: [
      otelPlugin({ parentContext: parentCtx, serviceName: 'my-chatbot' }),
    ],
  });

  // ... build context and call LLM
}
```

Now the `slotmux.build` span appears as a child of the HTTP handler span in your trace viewer.

## Example: Node.js with console exporter

A minimal setup that prints spans and metrics to the console:

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { ConsoleMetricExporter, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { createContext, Context } from 'slotmux';
import { otelPlugin } from '@slotmux/plugin-otel';

const sdk = new NodeSDK({
  traceExporter: new ConsoleSpanExporter(),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new ConsoleMetricExporter(),
    exportIntervalMillis: 5000,
  }),
});
sdk.start();

const { config } = createContext({
  model: 'gpt-4o',
  preset: 'chat',
  plugins: [otelPlugin({ serviceName: 'example' })],
});

const ctx = Context.fromParsedConfig(config);
ctx.system('You are a helpful assistant.');
ctx.user('Hello!');

await ctx.build();
// Console output includes:
// - slotmux.build span with attributes
// - slotmux.build.duration histogram
// - slotmux.utilization histogram
// - slotmux.tokens.used histogram

await sdk.shutdown();
```

## Example: OTLP exporter (Jaeger, Grafana Tempo, Datadog)

Replace the console exporter with OTLP to send traces to your backend:

```typescript
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:4318/v1/traces',
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: 'http://localhost:4318/v1/metrics',
    }),
  }),
});
```

This works with:

- **Jaeger** — `jaeger-all-in-one` with OTLP receiver
- **Grafana Tempo** — via the OTLP ingestor
- **Datadog** — via the Datadog Agent's OTLP endpoint
- **New Relic** — via their OTLP gateway
- **Any OTLP-compatible backend**

## Dashboard recommendations

### Grafana

Create a dashboard with these panels:

| Panel | Query (PromQL) | Visualization |
| --- | --- | --- |
| Build latency p50/p95/p99 | `histogram_quantile(0.95, slotmux_build_duration_bucket)` | Time series |
| Context utilization | `slotmux_utilization` | Gauge (0–1) |
| Tokens used | `slotmux_tokens_used` | Time series |
| Overflow events | Count of `slotmux.overflow` spans | Bar chart by `slotmux.slot` |
| Compression ratio | `slotmux.ratio` attribute on `slotmux.compress` spans | Heatmap |

### Jaeger

Search for service `my-chatbot`, operation `slotmux.build`. Expand child spans to see overflow and compression details. Use the compare view to spot regressions in build time or token usage.

## Span constants

The plugin exports constants for programmatic access:

```typescript
import {
  OTEL_SPAN_BUILD,       // 'slotmux.build'
  OTEL_SPAN_OVERFLOW,    // 'slotmux.overflow'
  OTEL_SPAN_COMPRESS,    // 'slotmux.compress'
  OTEL_METRIC_BUILD_DURATION,  // 'slotmux.build.duration'
  OTEL_METRIC_UTILIZATION,     // 'slotmux.utilization'
  OTEL_METRIC_TOKENS_USED,    // 'slotmux.tokens.used'
} from '@slotmux/plugin-otel';
```

Use these in tests or custom instrumentation to assert on span names without hardcoding strings.

## How it works

The plugin implements a single `onEvent` hook. It creates spans and records metrics based on pipeline events:

1. **`build:start`** — opens a `slotmux.build` span with `totalBudget` attribute.
2. **`slot:overflow`** — creates a child `slotmux.overflow` span (instant, no duration).
3. **`compression:start`** — opens a child `slotmux.compress` span.
4. **`compression:complete`** — adds ratio/token attributes and closes the compress span.
5. **`build:complete`** — records all three histograms, adds final attributes, closes the build span.

No other hooks are used. The plugin is stateless except for tracking the current build span and open compression spans.

## Next

- [Events and observability](./events-and-observability) — event-based metrics without OpenTelemetry.
- [Debug inspector](./debug-inspector) — visual development-time inspector.
- [Events concept](/concepts/events) — all 10 event types.
