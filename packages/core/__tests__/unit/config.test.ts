import { describe, expect, it } from 'vitest';

import { createContentId, toTokenCount } from '../../src/types/branded.js';
import type {
  ContextConfig,
  SlotBudget,
  SlotConfig,
  SlotOverflowStrategy,
  OverflowConfig,
  ProviderConfig,
  TokenizerConfig,
} from '../../src/types/config.js';

describe('SlotBudget', () => {
  it('accepts fixed budget', () => {
    const budget: SlotBudget = { fixed: 1500 };
    expect(budget).toHaveProperty('fixed', 1500);
  });

  it('accepts percent budget', () => {
    const budget: SlotBudget = { percent: 30 };
    expect(budget).toHaveProperty('percent', 30);
  });

  it('accepts flex budget', () => {
    const budget: SlotBudget = { flex: true };
    expect(budget).toHaveProperty('flex', true);
  });

  it('accepts bounded flex budget', () => {
    const budget: SlotBudget = { min: 100, max: 5000, flex: true };
    expect(budget).toHaveProperty('min', 100);
    expect(budget).toHaveProperty('max', 5000);
    expect(budget).toHaveProperty('flex', true);
  });
});

describe('SlotConfig', () => {
  it('accepts minimal slot config', () => {
    const config: SlotConfig = {
      priority: 50,
      budget: { percent: 50 },
    };
    expect(config.priority).toBe(50);
    expect(config.budget).toEqual({ percent: 50 });
  });

  it('accepts full slot config with overflow', () => {
    const config: SlotConfig = {
      priority: 80,
      budget: { fixed: 2000 },
      overflow: 'summarize',
      overflowConfig: {
        preserveLastN: 5,
        windowSize: 20,
      },
      position: 'after',
      maxItems: 100,
      defaultRole: 'user',
    };
    expect(config.overflow).toBe('summarize');
    expect(config.overflowConfig?.preserveLastN).toBe(5);
  });
});

describe('SlotOverflowStrategy', () => {
  it('accepts all named strategies', () => {
    const strategies: SlotOverflowStrategy[] = [
      'truncate',
      'truncate-latest',
      'summarize',
      'sliding-window',
      'semantic',
      'compress',
      'error',
    ];
    expect(strategies).toHaveLength(7);
  });

  it('accepts custom strategy function', () => {
    const custom: SlotOverflowStrategy = (items, budget, context) => {
      expect(context.slot).toBeDefined();
      return items.slice(0, Math.floor(items.length / 2));
    };
    const items = [
      {
        id: createContentId(),
        role: 'user' as const,
        content: 'test',
        slot: 'history',
        createdAt: Date.now(),
      },
    ];
    const result = custom(items, toTokenCount(100), { slot: 'history' });
    expect(result).toHaveLength(0);
  });
});

describe('OverflowConfig', () => {
  it('accepts summarize config', () => {
    const config: OverflowConfig = {
      summarizer: 'builtin:progressive',
      preserveLastN: 10,
      summaryBudget: { percent: 20 },
      summarizeThreshold: 5,
    };
    expect(config.summarizer).toBe('builtin:progressive');
    expect(config.preserveLastN).toBe(10);
  });

  it('accepts semantic config', () => {
    const config: OverflowConfig = {
      similarityThreshold: 0.7,
      anchorTo: 'lastUserMessage',
      embedFn: async (text) => text.split('').map(() => 0.1),
    };
    expect(config.similarityThreshold).toBe(0.7);
    expect(config.anchorTo).toBe('lastUserMessage');
  });

  it('accepts sliding window config', () => {
    const config: OverflowConfig = { windowSize: 50 };
    expect(config.windowSize).toBe(50);
  });

  it('accepts compress config', () => {
    const config: OverflowConfig = { compressionLevel: 0.5 };
    expect(config.compressionLevel).toBe(0.5);
  });
});

describe('ProviderConfig', () => {
  it('accepts minimal provider config', () => {
    const config: ProviderConfig = {};
    expect(config).toEqual({});
  });

  it('accepts provider and baseUrl', () => {
    const config: ProviderConfig = {
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
    };
    expect(config.provider).toBe('openai');
    expect(config.baseUrl).toBeDefined();
  });
});

describe('TokenizerConfig', () => {
  it('accepts minimal tokenizer config', () => {
    const config: TokenizerConfig = {};
    expect(config).toEqual({});
  });

  it('accepts name and cache options', () => {
    const config: TokenizerConfig = {
      name: 'cl100k_base',
      cache: true,
    };
    expect(config.name).toBe('cl100k_base');
    expect(config.cache).toBe(true);
  });
});

describe('ContextConfig', () => {
  it('accepts minimal context config', () => {
    const config: ContextConfig = { model: 'gpt-4-turbo' };
    expect(config.model).toBe('gpt-4-turbo');
  });

  it('accepts full context config', () => {
    const config: ContextConfig = {
      model: 'claude-sonnet-4-20250514',
      reserveForResponse: 4096,
      maxTokens: 200_000,
      slots: {
        system: {
          priority: 100,
          budget: { fixed: 1500 },
          overflow: 'error',
        },
        history: {
          priority: 50,
          budget: { percent: 50 },
          overflow: 'summarize',
        },
      },
      immutableSnapshots: true,
      tokenizer: { name: 'cl100k_base', cache: true },
    };
    expect(config.model).toBe('claude-sonnet-4-20250514');
    expect(config.slots?.system?.priority).toBe(100);
    expect(config.slots?.history?.overflow).toBe('summarize');
  });
});
