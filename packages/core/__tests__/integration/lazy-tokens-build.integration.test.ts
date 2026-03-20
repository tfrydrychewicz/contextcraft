/**
 * Build pipeline: lazy token fill + snapshot reuse (design doc optimization chapter).
 *
 * @packageDocumentation
 */

import { describe, expect, it, vi } from 'vitest';

import {
  Context,
  InvalidConfigError,
  toTokenCount,
  validateContextConfig,
  type ModelId,
  type ProviderAdapter,
  type ProviderId,
  type Tokenizer,
} from '../../src/index.js';

function stubTokenizer(): Tokenizer {
  return {
    id: 'stub',
    count: (s) => toTokenCount(s.length),
    countBatch: (texts) => texts.map((s) => toTokenCount(s.length)),
    countMessage: () => toTokenCount(0),
    countMessages: () => toTokenCount(0),
    encode: () => [],
    decode: () => '',
    truncateToFit: (t) => t,
  };
}

function openaiAdapter(): ProviderAdapter {
  return {
    id: 'openai',
    resolveModel: (_modelId: ModelId) => ({
      maxContextTokens: 128_000,
      maxOutputTokens: 4096,
      supportsFunctions: true,
      supportsVision: false,
      supportsStreaming: true,
      tokenizerName: 'stub',
    }),
    formatMessages: (messages) => messages,
    getTokenizer: stubTokenizer,
    calculateOverhead: () => toTokenCount(0),
  };
}

describe('Lazy tokens + reuse (integration)', () => {
  it('lazyContentItemTokens fills tokens via countBatch during build', async () => {
    const countBatch = vi.fn((texts: readonly string[]) =>
      texts.map((t) => toTokenCount(t.length * 10)),
    );
    const tokenizer: Tokenizer = {
      ...stubTokenizer(),
      countBatch,
    };
    const adapter: ProviderAdapter = {
      ...openaiAdapter(),
      getTokenizer: () => tokenizer,
    };

    const parsed = validateContextConfig({
      model: 'gpt-4o-mini',
      maxTokens: 50_000,
      redaction: false,
      lazyContentItemTokens: true,
      slots: {
        system: {
          priority: 100,
          budget: { fixed: 100 },
          defaultRole: 'system',
          position: 'before',
          overflow: 'truncate',
        },
        history: {
          priority: 50,
          budget: { fixed: 10_000 },
          defaultRole: 'user',
          position: 'after',
          overflow: 'truncate',
        },
      },
    });
    const ctx = Context.fromParsedConfig(parsed);
    ctx.system('sys');
    ctx.push('history', [{ content: 'hello', role: 'user' }]);

    await ctx.build({ providerAdapters: { openai: adapter } as Record<ProviderId, ProviderAdapter> });

    expect(countBatch).toHaveBeenCalled();
    const [row] = ctx.getItems('history');
    expect(row?.tokens).toEqual(toTokenCount(50));
  });

  it('reuseUnchangedSnapshot returns same snapshot reference', async () => {
    const parsed = validateContextConfig({
      model: 'gpt-4o-mini',
      maxTokens: 20_000,
      redaction: false,
      slots: {
        system: {
          priority: 100,
          budget: { fixed: 50 },
          defaultRole: 'system',
          position: 'before',
          overflow: 'truncate',
        },
        history: {
          priority: 50,
          budget: { fixed: 5000 },
          defaultRole: 'user',
          position: 'after',
          overflow: 'truncate',
        },
      },
    });
    const ctx = Context.fromParsedConfig(parsed);
    ctx.system('s');
    ctx.push('history', [{ content: 'one', tokens: toTokenCount(2), role: 'user' }]);

    const a = await ctx.build({ reuseUnchangedSnapshot: true });
    const b = await ctx.build({ reuseUnchangedSnapshot: true });
    expect(b.snapshot).toBe(a.snapshot);
  });

  it('requireAuthoritativeTokenCounts rejects lazyContentItemTokens at build', async () => {
    const parsed = validateContextConfig({
      model: 'gpt-4o-mini',
      maxTokens: 8000,
      requireAuthoritativeTokenCounts: true,
      lazyContentItemTokens: true,
      tokenAccountant: { countItems: () => 0 },
      slots: {
        h: {
          priority: 1,
          budget: { flex: true },
          defaultRole: 'user',
          position: 'after',
          overflow: 'truncate',
        },
      },
    });
    const ctx = Context.fromParsedConfig(parsed);
    await expect(ctx.build()).rejects.toThrow(InvalidConfigError);
  });
});
