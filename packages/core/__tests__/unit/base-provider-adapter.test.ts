import { describe, expect, it } from 'vitest';

import {
  BaseProviderAdapter,
  structuralOverheadForCompiledMessages,
  TOKEN_OVERHEAD,
  resolveModelCapabilitiesForAdapter,
  toTokenCount,
} from '../../src/index.js';
import type { CompiledMessage, ModelId, Tokenizer } from '../../src/index.js';

class TestOpenAiAdapter extends BaseProviderAdapter {
  constructor() {
    super('openai');
  }

  override formatMessages(messages: readonly CompiledMessage[]): unknown {
    return messages;
  }

  override getTokenizer(_modelId: ModelId): Tokenizer {
    return {
      id: 'stub',
      count: () => toTokenCount(0),
      countBatch: (texts) => texts.map(() => toTokenCount(0)),
      countMessage: () => toTokenCount(0),
      countMessages: () => toTokenCount(0),
      encode: () => [],
      decode: () => '',
      truncateToFit: (t) => t,
    };
  }
}

describe('structuralOverheadForCompiledMessages', () => {
  it('returns 0 for empty list', () => {
    expect(
      structuralOverheadForCompiledMessages([], TOKEN_OVERHEAD.openai),
    ).toBe(0);
  });

  it('sums perConversation, perMessage, and perName (OpenAI)', () => {
    const messages: CompiledMessage[] = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b', name: 'x' },
    ];
    const o = TOKEN_OVERHEAD.openai;
    expect(structuralOverheadForCompiledMessages(messages, o)).toBe(
      o.perConversation + o.perMessage * 2 + o.perName,
    );
  });

  it('ignores perName when zero (Anthropic)', () => {
    const messages: CompiledMessage[] = [
      { role: 'user', content: 'a', name: 'n' },
    ];
    const o = TOKEN_OVERHEAD.anthropic;
    expect(structuralOverheadForCompiledMessages(messages, o)).toBe(
      o.perConversation + o.perMessage,
    );
  });
});

describe('resolveModelCapabilitiesForAdapter', () => {
  it('uses MODEL_REGISTRY when provider matches', () => {
    const caps = resolveModelCapabilitiesForAdapter('openai', 'gpt-4o');
    expect(caps.maxContextTokens).toBe(128_000);
    expect(caps.tokenizerName).toBe('o200k_base');
  });

  it('uses defaults when model is unknown but inferred provider matches', () => {
    const caps = resolveModelCapabilitiesForAdapter(
      'openai',
      'gpt-unknown-xyz',
    );
    expect(caps.maxContextTokens).toBe(128_000);
  });

  it('uses Anthropic defaults for mismatched model on Anthropic adapter', () => {
    const caps = resolveModelCapabilitiesForAdapter('anthropic', 'gpt-4o');
    expect(caps.maxContextTokens).toBe(200_000);
    expect(caps.tokenizerName).toBe('anthropic-claude');
  });
});

describe('BaseProviderAdapter', () => {
  it('delegates resolveModel and calculateOverhead', () => {
    const adapter = new TestOpenAiAdapter();
    expect(adapter.id).toBe('openai');
    const caps = adapter.resolveModel('gpt-4o-mini');
    expect(caps.maxContextTokens).toBe(128_000);

    const messages: CompiledMessage[] = [{ role: 'user', content: 'hi' }];
    expect(adapter.calculateOverhead(messages)).toEqual(
      toTokenCount(
        TOKEN_OVERHEAD.openai.perConversation +
          TOKEN_OVERHEAD.openai.perMessage,
      ),
    );
  });
});
