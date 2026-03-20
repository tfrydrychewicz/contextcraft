import { describe, expect, it } from 'vitest';

import {
  contextBuilder,
  ContextBuilder,
  InvalidConfigError,
  type ContextEvent,
} from '../../src/index.js';

describe('ContextBuilder (§6.5)', () => {
  it('throws if .build() without .model()', async () => {
    const b = new ContextBuilder().preset('chat').user('hi');
    await expect(b.build()).rejects.toThrow(InvalidConfigError);
  });

  it('chains model, reserve, preset, messages and returns snapshot', async () => {
    const { snapshot, context } = await contextBuilder()
      .model('gpt-4o')
      .preset('chat')
      .reserve(512)
      .system('You are concise')
      .user('Hello')
      .assistant('Hi there')
      .build();

    expect(snapshot.messages.map((m) => [m.role, m.content])).toEqual([
      ['system', 'You are concise'],
      ['user', 'Hello'],
      ['assistant', 'Hi there'],
    ]);
    expect(context.getItems('history')).toHaveLength(2);
    expect(snapshot.meta.totalBudget).toBeDefined();
    expect(snapshot.meta.buildTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('.slot() overrides preset layout', async () => {
    const { snapshot } = await contextBuilder()
      .model('m')
      .preset('chat')
      .slot('history', {
        priority: 50,
        budget: { flex: true },
        defaultRole: 'user',
        overflow: 'truncate',
      })
      .user('x')
      .build();

    expect(snapshot.messages.some((m) => m.role === 'user' && m.content === 'x')).toBe(
      true,
    );
  });

  it('.push() delegates to Context.push', async () => {
    const { snapshot } = await contextBuilder()
      .model('m')
      .preset('rag')
      .push('rag', 'doc chunk')
      .build();

    const ragMsg = snapshot.messages.find(
      (m) => typeof m.content === 'string' && m.content === 'doc chunk',
    );
    expect(ragMsg).toBeDefined();
  });

  it('emits build:start and build:complete', async () => {
    const events: ContextEvent[] = [];
    await contextBuilder()
      .model('m')
      .preset('chat')
      .onEvent((e) => events.push(e))
      .system('s')
      .build();

    expect(events.some((e) => e.type === 'build:start')).toBe(true);
    expect(events.some((e) => e.type === 'build:complete')).toBe(true);
  });

  it('.reserve rejects negative values', () => {
    expect(() => contextBuilder().model('m').reserve(-1)).toThrow(InvalidConfigError);
  });

  it('serialize produces checksum', async () => {
    const { snapshot } = await contextBuilder()
      .model('m')
      .preset('chat')
      .user('u')
      .build();
    const ser = snapshot.serialize();
    expect(ser.version).toBe('1.0');
    expect(ser.checksum).toMatch(/^[a-f0-9]{64}$/);
  });
});
