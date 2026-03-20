import { describe, expect, it } from 'vitest';

import {
  contextConfigSchema,
  safeParseContextConfig,
  slotBudgetSchema,
  slotConfigSchema,
  validateContextConfig,
} from '../../src/config/validator.js';
import { InvalidConfigError } from '../../src/errors.js';

function baseContext(overrides: Record<string, unknown> = {}) {
  return {
    model: 'gpt-4o',
    ...overrides,
  };
}

describe('slotBudgetSchema', () => {
  it('accepts fixed, percent, flex, and bounded flex', () => {
    expect(slotBudgetSchema.safeParse({ fixed: 0 }).success).toBe(true);
    expect(slotBudgetSchema.safeParse({ fixed: 4096 }).success).toBe(true);
    expect(slotBudgetSchema.safeParse({ percent: 0 }).success).toBe(true);
    expect(slotBudgetSchema.safeParse({ percent: 100 }).success).toBe(true);
    expect(slotBudgetSchema.safeParse({ flex: true }).success).toBe(true);
    expect(
      slotBudgetSchema.safeParse({ min: 100, max: 500, flex: true }).success,
    ).toBe(true);
  });

  it('rejects negative fixed', () => {
    const r = slotBudgetSchema.safeParse({ fixed: -1 });
    expect(r.success).toBe(false);
  });

  it('rejects percent out of range', () => {
    expect(slotBudgetSchema.safeParse({ percent: -0.1 }).success).toBe(false);
    expect(slotBudgetSchema.safeParse({ percent: 100.1 }).success).toBe(false);
  });

  it('rejects bounded flex when min > max', () => {
    const r = slotBudgetSchema.safeParse({
      min: 500,
      max: 100,
      flex: true,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('max'))).toBe(true);
    }
  });
});

describe('slotConfigSchema', () => {
  it('accepts priority in 1–100', () => {
    const ok = slotConfigSchema.safeParse({
      priority: 1,
      budget: { flex: true },
    });
    expect(ok.success).toBe(true);
    const ok100 = slotConfigSchema.safeParse({
      priority: 100,
      budget: { percent: 50 },
    });
    expect(ok100.success).toBe(true);
  });

  it('rejects priority below 1 or above 100', () => {
    expect(
      slotConfigSchema.safeParse({ priority: 0, budget: { flex: true } })
        .success,
    ).toBe(false);
    expect(
      slotConfigSchema.safeParse({ priority: 101, budget: { flex: true } })
        .success,
    ).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    const r = slotConfigSchema.safeParse({
      priority: 10,
      budget: { flex: true },
      extraField: true,
    });
    expect(r.success).toBe(false);
  });
});

describe('contextConfigSchema — cross-slot rules', () => {
  it('accepts when sum of percent budgets is at most 100', () => {
    const r = contextConfigSchema.safeParse(
      baseContext({
        slots: {
          a: { priority: 1, budget: { percent: 60 } },
          b: { priority: 2, budget: { percent: 40 } },
        },
      }),
    );
    expect(r.success).toBe(true);
  });

  it('rejects when sum of percent budgets exceeds 100', () => {
    const r = contextConfigSchema.safeParse(
      baseContext({
        slots: {
          a: { priority: 1, budget: { percent: 60 } },
          b: { priority: 2, budget: { percent: 50 } },
        },
      }),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      const custom = r.error.issues.find((i) => i.code === 'custom');
      expect(custom?.message).toMatch(/100/);
    }
  });

  it('accepts fixed sum equal to maxTokens', () => {
    const r = contextConfigSchema.safeParse(
      baseContext({
        maxTokens: 8000,
        slots: {
          sys: { priority: 1, budget: { fixed: 2000 } },
          hist: { priority: 2, budget: { fixed: 6000 } },
        },
      }),
    );
    expect(r.success).toBe(true);
  });

  it('rejects fixed sum greater than maxTokens', () => {
    const r = contextConfigSchema.safeParse(
      baseContext({
        maxTokens: 5000,
        slots: {
          a: { priority: 1, budget: { fixed: 3000 } },
          b: { priority: 2, budget: { fixed: 3000 } },
        },
      }),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      const custom = r.error.issues.find((i) => i.code === 'custom');
      expect(custom?.message).toMatch(/maxTokens/);
    }
  });

  it('does not enforce fixed cap when maxTokens is omitted', () => {
    const r = contextConfigSchema.safeParse(
      baseContext({
        slots: {
          a: { priority: 1, budget: { fixed: 1_000_000 } },
        },
      }),
    );
    expect(r.success).toBe(true);
  });

  it('rejects unknown root keys (strict)', () => {
    const r = contextConfigSchema.safeParse(
      baseContext({ unknownRoot: 1 } as Record<string, unknown>),
    );
    expect(r.success).toBe(false);
  });
});

describe('validateContextConfig / safeParseContextConfig', () => {
  it('accepts redaction: false (§13.3)', () => {
    const r = contextConfigSchema.safeParse({
      model: 'gpt-4o',
      redaction: false,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.redaction).toBe(false);
    }
  });

  it('returns parsed data for valid config', () => {
    const data = baseContext();
    expect(validateContextConfig(data)).toMatchObject({ model: 'gpt-4o' });
  });

  it('throws InvalidConfigError with issues in context', () => {
    expect(() =>
      validateContextConfig({ model: '' }),
    ).toThrow(InvalidConfigError);
    try {
      validateContextConfig({ model: '' });
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidConfigError);
      const err = e as InvalidConfigError;
      expect(err.code).toBe('INVALID_CONFIG');
      expect(Array.isArray(err.context?.['issues'])).toBe(true);
    }
  });

  it('safeParseContextConfig returns success false without throwing', () => {
    const r = safeParseContextConfig({ model: '' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.length).toBeGreaterThan(0);
    }
  });
});
