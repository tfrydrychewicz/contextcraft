import { describe, expect, it } from 'vitest';

import {
  ContextCraftError,
  BudgetExceededError,
  ContextOverflowError,
  TokenizerNotFoundError,
  CompressionFailedError,
  SnapshotCorruptedError,
  InvalidConfigError,
} from '../../src/errors.js';

describe('ContextCraftError', () => {
  it('creates error with message and options', () => {
    const err = new ContextCraftError('Test error', {
      code: 'TEST',
      recoverable: true,
      context: { foo: 'bar' },
    });
    expect(err.message).toBe('Test error');
    expect(err.code).toBe('TEST');
    expect(err.recoverable).toBe(true);
    expect(err.context).toEqual({ foo: 'bar' });
    expect(err.name).toBe('ContextCraftError');
  });

  it('is instanceof Error and ContextCraftError', () => {
    const err = new ContextCraftError('Test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ContextCraftError);
  });

  it('preserves cause', () => {
    const cause = new Error('Original');
    const err = new ContextCraftError('Wrapped', { cause });
    expect(err.cause).toBe(cause);
  });
});

describe('BudgetExceededError', () => {
  it('has correct code and recoverable', () => {
    const err = new BudgetExceededError('Fixed slots exceed budget', {
      context: { totalBudget: 8000, fixedTotal: 15000 },
    });
    expect(err.code).toBe('BUDGET_EXCEEDED');
    expect(err.recoverable).toBe(false);
    expect(err.context?.['totalBudget']).toBe(8000);
  });
});

describe('ContextOverflowError', () => {
  it('has slot and token fields', () => {
    const err = new ContextOverflowError('Slot overflowed', {
      slot: 'history',
      budgetTokens: 5000,
      actualTokens: 6200,
    });
    expect(err.code).toBe('CONTEXT_OVERFLOW');
    expect(err.recoverable).toBe(true);
    expect(err.slot).toBe('history');
    expect(err.budgetTokens).toBe(5000);
    expect(err.actualTokens).toBe(6200);
  });
});

describe('TokenizerNotFoundError', () => {
  it('has correct code', () => {
    const err = new TokenizerNotFoundError('cl100k_base not found');
    expect(err.code).toBe('TOKENIZER_NOT_FOUND');
    expect(err.recoverable).toBe(false);
  });
});

describe('CompressionFailedError', () => {
  it('has fallbackStrategy', () => {
    const err = new CompressionFailedError('Summarization failed', {
      fallbackStrategy: 'truncate',
    });
    expect(err.code).toBe('COMPRESSION_FAILED');
    expect(err.recoverable).toBe(true);
    expect(err.fallbackStrategy).toBe('truncate');
  });
});

describe('SnapshotCorruptedError', () => {
  it('has correct code', () => {
    const err = new SnapshotCorruptedError('Checksum mismatch');
    expect(err.code).toBe('SNAPSHOT_CORRUPTED');
    expect(err.recoverable).toBe(false);
  });
});

describe('InvalidConfigError', () => {
  it('has correct code', () => {
    const err = new InvalidConfigError('Slot percentages exceed 100%', {
      context: { issues: [] },
    });
    expect(err.code).toBe('INVALID_CONFIG');
    expect(err.recoverable).toBe(false);
    expect(err.context?.['issues']).toEqual([]);
  });
});

describe('Error inheritance', () => {
  it('all errors extend ContextCraftError', () => {
    expect(new BudgetExceededError('x')).toBeInstanceOf(ContextCraftError);
    expect(new ContextOverflowError('x', { slot: 's', budgetTokens: 1, actualTokens: 2 })).toBeInstanceOf(ContextCraftError);
    expect(new TokenizerNotFoundError('x')).toBeInstanceOf(ContextCraftError);
    expect(new CompressionFailedError('x', { fallbackStrategy: 'y' })).toBeInstanceOf(ContextCraftError);
    expect(new SnapshotCorruptedError('x')).toBeInstanceOf(ContextCraftError);
    expect(new InvalidConfigError('x')).toBeInstanceOf(ContextCraftError);
  });
});
