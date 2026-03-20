/**
 * Deterministic context shapes for benchmark scenarios (§17.5, §18.1).
 *
 * Each scenario uses `overflow: 'truncate'` and `redaction: false` so timings reflect the
 * core build pipeline, not summarization or redaction work.
 *
 * @packageDocumentation
 */

import {
  Context,
  validateContextConfig,
  toTokenCount,
  type ContextPushItemInput,
  type SlotConfig,
} from '../../src/index.js';

/** Scenario ids used by {@link createContextForScenario}. */
export type BenchmarkScenarioId = 'small-chat' | 'large-rag' | 'agent-loop' | 'stress-test';

/** Human-readable labels + spec line for reports / docs. */
export const BENCHMARK_SCENARIO_META: Record<
  BenchmarkScenarioId,
  { readonly title: string; readonly spec: string }
> = {
  'small-chat': {
    title: 'small-chat',
    spec: '50 messages, 2 slots (system + history)',
  },
  'large-rag': {
    title: 'large-rag',
    spec: '500 chunks across 5 slots (100 per slot)',
  },
  'agent-loop': {
    title: 'agent-loop',
    spec: '200 tool messages + light system/history, 4 slots',
  },
  'stress-test': {
    title: 'stress-test',
    spec: '10,000 messages across 10 slots (1,000 per slot)',
  },
};

function batchRows(count: number, tokensPerRow: number): ContextPushItemInput[] {
  return Array.from({ length: count }, (_, i) => ({
    content: `m-${i}`,
    tokens: toTokenCount(tokensPerRow),
  }));
}

function slotsTwoChatTruncate(): Record<string, SlotConfig> {
  return {
    system: {
      priority: 100,
      budget: { fixed: 2000 },
      defaultRole: 'system',
      position: 'before',
      overflow: 'truncate',
    },
    history: {
      priority: 50,
      budget: { percent: 100 },
      defaultRole: 'user',
      position: 'after',
      overflow: 'truncate',
    },
  };
}

function slotsFiveChunkTruncate(): Record<string, SlotConfig> {
  const slots: Record<string, SlotConfig> = {};
  for (let i = 0; i < 5; i++) {
    slots[`c${i}`] = {
      priority: 100 - i * 5,
      budget: { fixed: 250_000 },
      defaultRole: 'user',
      position: i === 0 ? 'before' : 'after',
      overflow: 'truncate',
    };
  }
  return slots;
}

function slotsFourAgentTruncate(): Record<string, SlotConfig> {
  return {
    system: {
      priority: 100,
      budget: { fixed: 2000 },
      defaultRole: 'system',
      position: 'before',
      overflow: 'truncate',
    },
    tools: {
      priority: 85,
      budget: { flex: true },
      defaultRole: 'tool',
      position: 'before',
      overflow: 'truncate',
    },
    scratchpad: {
      priority: 65,
      budget: { flex: true },
      defaultRole: 'user',
      position: 'interleave',
      order: 10,
      overflow: 'truncate',
    },
    history: {
      priority: 50,
      budget: { flex: true },
      defaultRole: 'user',
      position: 'after',
      overflow: 'truncate',
    },
  };
}

function slotsTenStressTruncate(): Record<string, SlotConfig> {
  const slots: Record<string, SlotConfig> = {};
  for (let i = 0; i < 10; i++) {
    slots[`p${i}`] = {
      priority: 100 - i,
      budget: { fixed: 600_000 },
      defaultRole: 'user',
      position: i === 0 ? 'before' : 'after',
      overflow: 'truncate',
    };
  }
  return slots;
}

/**
 * Builds a populated {@link Context} ready for repeated {@link Context.build} calls.
 */
export function createContextForScenario(id: BenchmarkScenarioId): Context {
  switch (id) {
    case 'small-chat': {
      const parsed = validateContextConfig({
        model: 'bench-small-chat',
        maxTokens: 500_000,
        redaction: false,
        slots: slotsTwoChatTruncate(),
      });
      const ctx = Context.fromParsedConfig(parsed);
      ctx.system('system-prompt');
      ctx.push('history', batchRows(50, 8));
      return ctx;
    }
    case 'large-rag': {
      const parsed = validateContextConfig({
        model: 'bench-large-rag',
        maxTokens: 3_000_000,
        redaction: false,
        slots: slotsFiveChunkTruncate(),
      });
      const ctx = Context.fromParsedConfig(parsed);
      for (let i = 0; i < 5; i++) {
        ctx.push(`c${i}`, batchRows(100, 16));
      }
      return ctx;
    }
    case 'agent-loop': {
      const parsed = validateContextConfig({
        model: 'bench-agent-loop',
        maxTokens: 1_000_000,
        redaction: false,
        slots: slotsFourAgentTruncate(),
      });
      const ctx = Context.fromParsedConfig(parsed);
      ctx.system('You are a benchmark agent.');
      const toolRows: ContextPushItemInput[] = Array.from({ length: 200 }, (_, i) => ({
        content: `tool-result-${i}`,
        tokens: toTokenCount(6),
        role: 'tool',
      }));
      ctx.push('tools', toolRows);
      ctx.push('scratchpad', batchRows(3, 10));
      ctx.user('user turn');
      return ctx;
    }
    case 'stress-test': {
      const parsed = validateContextConfig({
        model: 'bench-stress',
        maxTokens: 8_000_000,
        redaction: false,
        slots: slotsTenStressTruncate(),
      });
      const ctx = Context.fromParsedConfig(parsed);
      for (let i = 0; i < 10; i++) {
        ctx.push(`p${i}`, batchRows(1000, 5));
      }
      return ctx;
    }
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export const ALL_BENCHMARK_SCENARIO_IDS: readonly BenchmarkScenarioId[] = [
  'small-chat',
  'large-rag',
  'agent-loop',
  'stress-test',
];
