import { describe, expect, it } from 'vitest';

import { LogLevel } from '../../src/logging/logger.js';
import {
  createContextEventRedactor,
  RedactionEngine,
  redactContextEvent,
  shouldRedactObservability,
} from '../../src/logging/redaction-engine.js';
import { createContentId, toTokenCount } from '../../src/types/branded.js';
import type { ContentItem } from '../../src/types/content.js';
import type { ContextEvent } from '../../src/types/events.js';
import type { ContextWarning } from '../../src/types/snapshot.js';

describe('RedactionEngine', () => {
  it('redacts with default patterns', () => {
    const engine = RedactionEngine.defaultEngine();
    expect(engine.redactString('email me@x.com')).toBe('email [REDACTED]');
  });

  it('accepts custom patterns', () => {
    const engine = new RedactionEngine({
      patterns: [/SECRET/g],
      replacement: 'X',
    });
    expect(engine.redactString('SECRET code')).toBe('X code');
  });

  it('fromConfig(true) matches defaultEngine', () => {
    const a = RedactionEngine.fromConfig(true);
    const b = RedactionEngine.defaultEngine();
    expect(a.redactString('123-45-6789')).toBe(b.redactString('123-45-6789'));
  });
});

describe('shouldRedactObservability', () => {
  it('is true by default (redaction omitted) — Phase 13.3', () => {
    expect(shouldRedactObservability({})).toBe(true);
  });

  it('is false when redaction: false', () => {
    expect(shouldRedactObservability({ redaction: false })).toBe(false);
  });

  it('is true when redaction set and level not TRACE', () => {
    expect(shouldRedactObservability({ redaction: true, logLevel: LogLevel.INFO })).toBe(true);
  });

  it('is true with custom redaction patterns object', () => {
    expect(
      shouldRedactObservability({
        redaction: { patterns: [/x/g] },
        logLevel: LogLevel.INFO,
      }),
    ).toBe(true);
  });

  it('is false at TRACE (full observability)', () => {
    expect(shouldRedactObservability({ redaction: true, logLevel: LogLevel.TRACE })).toBe(false);
  });

  it('is false at TRACE even when redaction omitted', () => {
    expect(shouldRedactObservability({ logLevel: LogLevel.TRACE })).toBe(false);
  });
});

describe('redactContextEvent', () => {
  it('redacts content:added item strings', () => {
    const engine = RedactionEngine.defaultEngine();
    const item: ContentItem = {
      id: createContentId(),
      role: 'user',
      content: 'reach me@evil.com',
      slot: 'history',
      createdAt: 1,
    };
    const out = redactContextEvent({ type: 'content:added', slot: 'history', item }, engine);
    expect(out.type).toBe('content:added');
    if (out.type === 'content:added') {
      expect(out.item.content).toBe('reach [REDACTED]');
    }
  });
});

describe('createContextEventRedactor', () => {
  it('returns a redactor when redaction omitted (default on)', () => {
    const r = createContextEventRedactor({});
    expect(r).toBeDefined();
    const item: ContentItem = {
      id: createContentId(),
      role: 'user',
      content: 'x@y.co',
      slot: 'h',
      createdAt: 1,
    };
    const ev = r!({ type: 'content:added', slot: 'h', item });
    if (ev.type === 'content:added') {
      expect(ev.item.content).toBe('[REDACTED]');
    }
  });

  it('returns undefined when redaction: false', () => {
    expect(createContextEventRedactor({ redaction: false })).toBeUndefined();
  });

  it('returns undefined at TRACE', () => {
    expect(createContextEventRedactor({ redaction: true, logLevel: LogLevel.TRACE })).toBeUndefined();
  });

  it('redacts in returned closure', () => {
    const r = createContextEventRedactor({ redaction: true, logLevel: LogLevel.DEBUG });
    expect(r).toBeDefined();
    const item: ContentItem = {
      id: createContentId(),
      role: 'user',
      content: '123-45-6789',
      slot: 'h',
      createdAt: 1,
    };
    const ev = r!({ type: 'content:added', slot: 'h', item });
    if (ev.type === 'content:added') {
      expect(ev.item.content).toBe('[REDACTED]');
    }
  });
});

describe('redactContextEvent — all ContextEvent shapes (Phase 13.3)', () => {
  const engine = RedactionEngine.defaultEngine();
  const secret = 'leak@evil.com';

  it('content:evicted redacts item and reason', () => {
    const item: ContentItem = {
      id: createContentId(),
      role: 'user',
      content: secret,
      slot: 'history',
      createdAt: 1,
    };
    const ev = redactContextEvent(
      { type: 'content:evicted', slot: 'history', item, reason: `drop ${secret}` },
      engine,
    );
    expect(ev.type).toBe('content:evicted');
    if (ev.type === 'content:evicted') {
      expect(ev.item.content).toBe('[REDACTED]');
      expect(ev.reason).toBe('drop [REDACTED]');
    }
  });

  it('slot:overflow redacts string fields', () => {
    const ev = redactContextEvent(
      {
        type: 'slot:overflow',
        slot: 'history',
        strategy: `trunc ${secret}`,
        beforeTokens: 1,
        afterTokens: 0,
      },
      engine,
    ) as Extract<ContextEvent, { type: 'slot:overflow' }>;
    expect(ev.strategy).toBe('trunc [REDACTED]');
  });

  it('slot:budget-resolved redacts slot name strings', () => {
    const ev = redactContextEvent(
      { type: 'slot:budget-resolved', slot: 'track-123-45-6789', budgetTokens: 10 },
      engine,
    ) as Extract<ContextEvent, { type: 'slot:budget-resolved' }>;
    expect(ev.slot).toBe('track-[REDACTED]');
  });

  it('compression:start / complete and build:start redact slot strings', () => {
    const start = redactContextEvent(
      { type: 'compression:start', slot: secret, itemCount: 2 },
      engine,
    ) as Extract<ContextEvent, { type: 'compression:start' }>;
    expect(start.slot).toBe('[REDACTED]');

    const done = redactContextEvent(
      {
        type: 'compression:complete',
        slot: secret,
        beforeTokens: 10,
        afterTokens: 5,
        ratio: 0.5,
      },
      engine,
    ) as Extract<ContextEvent, { type: 'compression:complete' }>;
    expect(done.slot).toBe('[REDACTED]');

    const bs = redactContextEvent({ type: 'build:start', totalBudget: 100 }, engine);
    expect(bs.type).toBe('build:start');
  });

  it('warning redacts message in warning object', () => {
    const warning: ContextWarning = {
      code: 'X',
      message: `note ${secret}`,
      severity: 'warn',
    };
    const ev = redactContextEvent({ type: 'warning', warning }, engine);
    expect(ev.type).toBe('warning');
    if (ev.type === 'warning') {
      expect(ev.warning.message).toBe('note [REDACTED]');
    }
  });
});

describe('RedactionEngine redactUnknown with tokens', () => {
  it('preserves numeric branded-like fields in plain objects', () => {
    const engine = RedactionEngine.defaultEngine();
    const out = engine.redactUnknown({ t: toTokenCount(5), s: 'me@x.com' }) as {
      t: unknown;
      s: string;
    };
    expect(out.t).toBe(5);
    expect(out.s).toBe('[REDACTED]');
  });
});
