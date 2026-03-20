/**
 * Structured logging: levels, console sink, scoping, redaction (§13.3 / Phase 7.3).
 *
 * @packageDocumentation
 */

import {
  DEFAULT_REDACTION_PATTERNS,
  type RedactionOptions,
  redactString,
  redactUnknown,
} from './redact.js';

// ==========================================
// Log level
// ==========================================

/**
 * Syslog-style numeric severity: lower = more severe.
 * A configured level shows that severity and **more severe** (lower number) messages.
 * Example: {@link LogLevel.INFO} shows ERROR, WARN, and INFO, but not DEBUG.
 */
export enum LogLevel {
  SILENT = -1,
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

function shouldEmit(configured: LogLevel, messageLevel: LogLevel): boolean {
  if (configured === LogLevel.SILENT) {
    return false;
  }
  return messageLevel <= configured;
}

// ==========================================
// Logger interface
// ==========================================

/**
 * Application / library logger (§13.3).
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export type ConsoleLoggerOptions = {
  /**
   * Prepended to every message, e.g. `[contextcraft]`.
   * When omitted, only `message` is passed through.
   */
  readonly prefix?: string;
};

/**
 * Delegates to `console` methods (browser or Node).
 */
export function createConsoleLogger(options?: ConsoleLoggerOptions): Logger {
  const prefix = options?.prefix;
  const fmt = (message: string): string =>
    prefix !== undefined ? `${prefix} ${message}` : message;

  return {
    debug: (message, ...args) => {
      console.debug(fmt(message), ...args);
    },
    info: (message, ...args) => {
      console.info(fmt(message), ...args);
    },
    warn: (message, ...args) => {
      console.warn(fmt(message), ...args);
    },
    error: (message, ...args) => {
      console.error(fmt(message), ...args);
    },
  };
}

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Drops log calls below `minLevel`. {@link LogLevel.SILENT} silences everything.
 */
export function createLeveledLogger(delegate: Logger, configured: LogLevel): Logger {
  if (configured === LogLevel.SILENT) {
    return noopLogger;
  }

  return {
    debug: (message, ...args) => {
      if (shouldEmit(configured, LogLevel.DEBUG)) {
        delegate.debug(message, ...args);
      }
    },
    info: (message, ...args) => {
      if (shouldEmit(configured, LogLevel.INFO)) {
        delegate.info(message, ...args);
      }
    },
    warn: (message, ...args) => {
      if (shouldEmit(configured, LogLevel.WARN)) {
        delegate.warn(message, ...args);
      }
    },
    error: (message, ...args) => {
      if (shouldEmit(configured, LogLevel.ERROR)) {
        delegate.error(message, ...args);
      }
    },
  };
}

/**
 * Prefixes messages with `[contextcraft:${scope}]` (plugin / subsystem label).
 */
export function createScopedLogger(delegate: Logger, scope: string): Logger {
  const p = `[contextcraft:${scope}]`;
  const fmt = (message: string): string => `${p} ${message}`;

  return {
    debug: (message, ...args) => delegate.debug(fmt(message), ...args),
    info: (message, ...args) => delegate.info(fmt(message), ...args),
    warn: (message, ...args) => delegate.warn(fmt(message), ...args),
    error: (message, ...args) => delegate.error(fmt(message), ...args),
  };
}

export type RedactingLoggerOptions = {
  readonly delegate: Logger;
  /**
   * When `true`, uses {@link DEFAULT_REDACTION_PATTERNS} from `./redact.js`.
   * When an object, uses its `patterns` / `replacement`.
   */
  readonly redaction: RedactionOptions | true;
};

/**
 * Redacts the message string and any `unknown` args (deep object walk) before forwarding.
 */
export function createRedactingLogger(options: RedactingLoggerOptions): Logger {
  const { delegate } = options;
  const ropts: RedactionOptions =
    options.redaction === true
      ? { patterns: [...DEFAULT_REDACTION_PATTERNS] }
      : options.redaction;

  const redactArgs = (args: unknown[]): unknown[] =>
    args.map((a) => redactUnknown(a, ropts));

  return {
    debug: (message, ...args) => {
      delegate.debug(redactString(message, ropts.patterns, ropts.replacement), ...redactArgs(args));
    },
    info: (message, ...args) => {
      delegate.info(redactString(message, ropts.patterns, ropts.replacement), ...redactArgs(args));
    },
    warn: (message, ...args) => {
      delegate.warn(redactString(message, ropts.patterns, ropts.replacement), ...redactArgs(args));
    },
    error: (message, ...args) => {
      delegate.error(redactString(message, ropts.patterns, ropts.replacement), ...redactArgs(args));
    },
  };
}

export type PluginLoggerFactoryOptions = {
  /** Default {@link LogLevel.INFO}. */
  readonly level?: LogLevel;
  /** Passed to {@link createConsoleLogger} (default `[contextcraft]`). */
  readonly consolePrefix?: string;
  /** When set, applies {@link createRedactingLogger} before scoping. */
  readonly redaction?: RedactionOptions | true;
};

/**
 * Returns a factory suitable for {@link PluginManagerOptions.createLogger}:
 * `[contextcraft:pluginName]` prefix, optional level filter and redaction.
 */
export function createPluginLoggerFactory(
  options?: PluginLoggerFactoryOptions,
): (pluginName: string) => Logger {
  const level = options?.level ?? LogLevel.INFO;
  const consolePrefix = options?.consolePrefix ?? '[contextcraft]';

  return (pluginName: string) => {
    let base: Logger = createConsoleLogger({ prefix: consolePrefix });
    base = createLeveledLogger(base, level);
    if (options?.redaction !== undefined) {
      base = createRedactingLogger({ delegate: base, redaction: options.redaction });
    }
    return createScopedLogger(base, pluginName);
  };
}
