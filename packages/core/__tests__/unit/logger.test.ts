import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createConsoleLogger,
  createLeveledLogger,
  createPluginLoggerFactory,
  createRedactingLogger,
  createScopedLogger,
  LogLevel,
} from '../../src/logging/logger.js';
import type { Logger } from '../../src/logging/logger.js';

describe('createLeveledLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('at INFO omits debug but keeps info, warn, error', () => {
    const inner: Logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const log = createLeveledLogger(inner, LogLevel.INFO);
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(inner.debug).not.toHaveBeenCalled();
    expect(inner.info).toHaveBeenCalledTimes(1);
    expect(inner.warn).toHaveBeenCalledTimes(1);
    expect(inner.error).toHaveBeenCalledTimes(1);
  });

  it('SILENT drops all', () => {
    const inner: Logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const log = createLeveledLogger(inner, LogLevel.SILENT);
    log.error('e');
    expect(inner.error).not.toHaveBeenCalled();
  });
});

describe('createScopedLogger', () => {
  it('prefixes message with contextcraft scope', () => {
    const info = vi.fn();
    const log = createScopedLogger({ debug: vi.fn(), info, warn: vi.fn(), error: vi.fn() }, 'my-plugin');
    log.info('hello');
    expect(info).toHaveBeenCalledWith('[contextcraft:my-plugin] hello');
  });
});

describe('createRedactingLogger', () => {
  it('redacts message and object args', () => {
    const info = vi.fn();
    const log = createRedactingLogger({
      delegate: { debug: vi.fn(), info, warn: vi.fn(), error: vi.fn() },
      redaction: true,
    });
    log.info('reach me@x.com', { ssn: '123-45-6789' });
    expect(info.mock.calls[0]![0]).toBe('reach [REDACTED]');
    expect(info.mock.calls[0]![1]).toEqual({ ssn: '[REDACTED]' });
  });
});

describe('createConsoleLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('applies optional prefix', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const log = createConsoleLogger({ prefix: '[ctx]' });
    log.info('m');
    expect(console.info).toHaveBeenCalledWith('[ctx] m');
  });
});

describe('createPluginLoggerFactory', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('produces scoped loggers with default prefix', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const factory = createPluginLoggerFactory({ level: LogLevel.INFO });
    const log = factory('rag');
    log.info('ready');
    expect(console.info).toHaveBeenCalledWith('[contextcraft] [contextcraft:rag] ready');
  });
});
