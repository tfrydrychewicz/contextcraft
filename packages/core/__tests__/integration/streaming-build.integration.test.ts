/**
 * Phase 12.1 — Streaming build (§14.1).
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import {
  Context,
  SlotOverflow,
  orderSlotsForCompile,
  validateContextConfig,
  type BuildStreamEvent,
  type CompiledMessage,
  type ModelId,
  type SlotConfig,
  type Tokenizer,
} from '../../src/index.js';
import { toTokenCount } from '../../src/types/branded.js';

function stubTokenizer(): Tokenizer {
  return {
    id: 'stub',
    count: (t: string) => toTokenCount(Math.ceil(t.length / 4)),
    countBatch: (texts: readonly string[]) =>
      texts.map((t) => toTokenCount(Math.ceil(t.length / 4))),
    countMessage: () => toTokenCount(1),
    countMessages: () => toTokenCount(1),
    encode: () => [],
    decode: () => '',
    truncateToFit: (t: string) => t,
  };
}

function msgText(m: CompiledMessage): string {
  return typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
}

describe('Streaming build (Phase 12.1 — §14.1)', () => {
  it('emits slot:ready in compile order then complete with same snapshot as build()', async () => {
    const parsed = validateContextConfig({
      model: 'gpt-4o-mini' as ModelId,
      maxTokens: 16_000,
      reserveForResponse: 0,
      tokenizer: stubTokenizer(),
      slots: {
        system: {
          priority: 100,
          budget: { fixed: 500 },
          defaultRole: 'system',
          position: 'before',
          overflow: SlotOverflow.TRUNCATE,
        },
        rag: {
          priority: 80,
          budget: { flex: true },
          defaultRole: 'user',
          position: 'before',
          overflow: SlotOverflow.TRUNCATE,
        },
        history: {
          priority: 50,
          budget: { flex: true },
          defaultRole: 'user',
          position: 'after',
          overflow: SlotOverflow.TRUNCATE,
        },
      },
    });

    const makeCtx = (): Context => {
      const c = Context.fromParsedConfig(parsed);
      c.system('You are helpful.');
      c.push('rag', 'Context from retrieval.');
      c.user('Hello.');
      return c;
    };

    const ctxStream = makeCtx();
    const ctxBatch = makeCtx();

    const expectedOrder = orderSlotsForCompile(parsed.slots as Record<string, SlotConfig>).map(
      (e) => e.name,
    );

    const readyOrder: string[] = [];
    const stream = ctxStream.buildStream();

    const slotMessages = new Map<string, CompiledMessage[]>();
    stream.on('slot:ready', (e: BuildStreamEvent) => {
      if (e.type === 'slot:ready') {
        readyOrder.push(e.slot);
        slotMessages.set(e.slot, e.messages);
      }
    });

    const [{ snapshot: built }, streamResult] = await Promise.all([
      ctxBatch.build(),
      stream.finished,
    ]);

    expect(readyOrder).toEqual(expectedOrder);
    expect(streamResult.snapshot.messages.map((m) => msgText(m))).toEqual(
      built.messages.map((m) => msgText(m)),
    );
    expect(slotMessages.get('system')?.[0]?.role).toBe('system');
    expect(msgText(slotMessages.get('rag')?.[0] ?? { role: 'user', content: '' })).toContain(
      'retrieval',
    );
  });

  it('allows late push into a not-yet-emitted slot (macrotask between slots)', async () => {
    const parsed = validateContextConfig({
      model: 'gpt-4o-mini' as ModelId,
      maxTokens: 16_000,
      reserveForResponse: 0,
      tokenizer: stubTokenizer(),
      slots: {
        system: {
          priority: 100,
          budget: { fixed: 500 },
          defaultRole: 'system',
          position: 'before',
          overflow: SlotOverflow.TRUNCATE,
        },
        rag: {
          priority: 80,
          budget: { flex: true },
          defaultRole: 'user',
          position: 'before',
          overflow: SlotOverflow.TRUNCATE,
        },
        history: {
          priority: 50,
          budget: { flex: true },
          defaultRole: 'user',
          position: 'after',
          overflow: SlotOverflow.TRUNCATE,
        },
      },
    });

    const ctx = Context.fromParsedConfig(parsed);
    ctx.system('Sys');
    ctx.user('Hi');

    const stream = ctx.buildStream();
    stream.on('slot:ready', (e: BuildStreamEvent) => {
      if (e.type === 'slot:ready' && e.slot === 'system') {
        setImmediate(() => {
          ctx.push('rag', 'Late RAG chunk.');
        });
      }
    });

    const { snapshot } = await stream.finished;
    const ragCompiled = snapshot.messages.filter((m) => m.role === 'user');
    const joined = ragCompiled.map((m) => msgText(m)).join('\n');
    expect(joined).toContain('Late RAG');
  });
});
