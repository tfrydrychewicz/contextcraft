/**
 * OpenTelemetry plugin for contextcraft (§13.4 / Phase 10.5).
 *
 * @packageDocumentation
 */

import {
  context as otelContext,
  metrics,
  trace,
  type Context as OtelContext,
  type Meter,
  type Span,
  type Tracer,
  SpanStatusCode,
} from '@opentelemetry/api';
import type { ContextEvent, ContextPlugin } from 'contextcraft';

import { VERSION } from './version.js';

const TRACER_NAME = 'contextcraft';
const METER_NAME = 'contextcraft';

/** Span names emitted by this plugin. */
export const OTEL_SPAN_BUILD = 'contextcraft.build';
export const OTEL_SPAN_OVERFLOW = 'contextcraft.overflow';
export const OTEL_SPAN_COMPRESS = 'contextcraft.compress';

/** Metric names (dotted, per §13.4). */
export const OTEL_METRIC_BUILD_DURATION = 'contextcraft.build.duration';
export const OTEL_METRIC_UTILIZATION = 'contextcraft.utilization';
export const OTEL_METRIC_TOKENS_USED = 'contextcraft.tokens.used';

export type OtelPluginOptions = {
  /**
   * Sets `service.name` on the root build span when provided.
   * Prefer configuring {@link Resource} on your SDK; this is a convenience.
   */
  readonly serviceName?: string;

  /**
   * Optional parent context (e.g. from `propagation.extract` on incoming HTTP headers).
   * When set, `contextcraft.build` is a child of that trace.
   */
  readonly parentContext?: OtelContext;

  /** Override tracer (defaults to {@link trace.getTracer} for {@link TRACER_NAME}). */
  readonly tracer?: Tracer;

  /** Override meter (defaults to {@link metrics.getMeter} for {@link METER_NAME}). */
  readonly meter?: Meter;
};

function parentCtxForSpan(parentSpan: Span | undefined): OtelContext {
  return parentSpan !== undefined
    ? trace.setSpan(otelContext.active(), parentSpan)
    : otelContext.active();
}

/**
 * Emits spans `contextcraft.build`, `contextcraft.overflow`, `contextcraft.compress`
 * and histograms `contextcraft.build.duration`, `contextcraft.utilization`, `contextcraft.tokens.used`.
 *
 * @remarks
 * Install an OpenTelemetry SDK (e.g. `@opentelemetry/sdk-node`) in your app so traces and metrics
 * export. This plugin uses the API only. Pipeline events are the same redacted payloads as `onEvent`.
 *
 * **Trace propagation**: Child spans link to `contextcraft.build` via explicit parent context.
 * For async context propagation across `await` inside custom strategies, register an SDK that
 * instruments async continuity (AsyncLocalStorage).
 */
export function otelPlugin(options: OtelPluginOptions = {}): ContextPlugin {
  const tracer = options.tracer ?? trace.getTracer(TRACER_NAME, VERSION);
  const meter = options.meter ?? metrics.getMeter(METER_NAME, VERSION);

  const buildDuration = meter.createHistogram(OTEL_METRIC_BUILD_DURATION, {
    unit: 'ms',
    description: 'Duration of ContextOrchestrator.build (wall time)',
  });
  const utilizationHist = meter.createHistogram(OTEL_METRIC_UTILIZATION, {
    description: 'Snapshot utilization ratio after build',
  });
  const tokensUsedHist = meter.createHistogram(OTEL_METRIC_TOKENS_USED, {
    unit: '{token}',
    description: 'Total tokens used in compiled snapshot',
  });

  let buildSpan: Span | undefined;
  const compressSpans = new Map<string, Span>();

  return {
    name: 'otel',
    version: VERSION,
    onEvent(ev: ContextEvent): void {
      if (ev.type === 'build:start') {
        const baseCtx = options.parentContext ?? otelContext.active();
        buildSpan = tracer.startSpan(
          OTEL_SPAN_BUILD,
          {
            attributes: {
              'contextcraft.total_budget': ev.totalBudget,
              ...(options.serviceName !== undefined
                ? { 'service.name': options.serviceName }
                : {}),
            },
          },
          baseCtx,
        );
        return;
      }

      if (ev.type === 'build:complete') {
        for (const s of compressSpans.values()) {
          s.setStatus({ code: SpanStatusCode.ERROR, message: 'build ended before compression:complete' });
          s.end();
        }
        compressSpans.clear();

        const meta = ev.snapshot.meta;
        buildDuration.record(meta.buildTimeMs);
        utilizationHist.record(meta.utilization);
        tokensUsedHist.record(Number(meta.totalTokens));

        if (buildSpan !== undefined) {
          buildSpan.setAttributes({
            'contextcraft.build_time_ms': meta.buildTimeMs,
            'contextcraft.utilization': meta.utilization,
            'contextcraft.total_tokens': meta.totalTokens,
            'contextcraft.message_count': ev.snapshot.messages.length,
          });
          buildSpan.setStatus({ code: SpanStatusCode.OK });
          buildSpan.end();
          buildSpan = undefined;
        }
        return;
      }

      if (ev.type === 'slot:overflow') {
        if (buildSpan === undefined) {
          return;
        }
        const span = tracer.startSpan(
          OTEL_SPAN_OVERFLOW,
          {
            attributes: {
              'contextcraft.slot': ev.slot,
              'contextcraft.strategy': ev.strategy,
              'contextcraft.before_tokens': ev.beforeTokens,
              'contextcraft.after_tokens': ev.afterTokens,
            },
          },
          parentCtxForSpan(buildSpan),
        );
        span.end();
        return;
      }

      if (ev.type === 'compression:start') {
        if (buildSpan === undefined) {
          return;
        }
        const span = tracer.startSpan(
          OTEL_SPAN_COMPRESS,
          {
            attributes: {
              'contextcraft.slot': ev.slot,
              'contextcraft.item_count': ev.itemCount,
            },
          },
          parentCtxForSpan(buildSpan),
        );
        compressSpans.set(ev.slot, span);
        return;
      }

      if (ev.type === 'compression:complete') {
        const span = compressSpans.get(ev.slot);
        if (span === undefined) {
          return;
        }
        span.setAttributes({
          'contextcraft.before_tokens': ev.beforeTokens,
          'contextcraft.after_tokens': ev.afterTokens,
          'contextcraft.ratio': ev.ratio,
        });
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        compressSpans.delete(ev.slot);
      }
    },
  };
}
