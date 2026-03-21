/**
 * Integration tests for the summarize overflow strategy with budget-aware
 * prompts, dynamic preserveLastN, multi-segment summaries, and proactive
 * compression.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  OverflowEngine,
  createContentItem,
  type OverflowEngineInputSlot,
} from '../../src/index.js';
import type { SlotConfig } from '../../src/types/config.js';
import type { ContentItem } from '../../src/types/content.js';

function slot(
  name: string,
  priority: number,
  budgetTokens: number,
  config: SlotConfig,
  content: ContentItem[],
): OverflowEngineInputSlot {
  return { name, priority, budgetTokens, config, content };
}

function countByChars(items: readonly ContentItem[]): number {
  return items.reduce(
    (s, i) => s + (typeof i.content === 'string' ? i.content.length : 0),
    0,
  );
}

/**
 * Returns a deterministic mock summarizer that produces output sized to
 * fit within `targetTokens` (measured in characters for test purposes).
 */
function makeDeterministicSummarizer() {
  const calls: Array<{ layer: number; targetTokens: number | undefined; prompt: string }> = [];

  const summarizeText = vi.fn(
    async ({ layer, systemPrompt, targetTokens }: {
      layer: number;
      systemPrompt: string;
      userPayload: string;
      targetTokens?: number;
    }) => {
      calls.push({ layer, targetTokens, prompt: systemPrompt });
      const target = targetTokens ?? 100;
      const prefix = layer === 2 ? 'L2: ' : layer === 1 ? 'L1: ' : 'L3: ';
      const fill = 'fact '.repeat(Math.max(1, Math.floor((target - prefix.length) / 5)));
      return (prefix + fill).slice(0, target);
    },
  );

  return { summarizeText, calls };
}

describe('Summarize overflow integration', () => {
  it('produces output utilizing >10% of budget with 100+ items', async () => {
    const { summarizeText } = makeDeterministicSummarizer();

    const items: ContentItem[] = [];
    for (let i = 0; i < 120; i++) {
      items.push(
        createContentItem({
          slot: 'history',
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Turn ${String(i)}: ${'lorem ipsum dolor sit amet '.repeat(10)}`,
          createdAt: 1000 + i * 1000,
        }),
      );
    }

    const totalInputChars = countByChars(items);
    const budget = 8192;
    expect(totalInputChars).toBeGreaterThan(budget);

    const engine = new OverflowEngine({
      countTokens: countByChars,
      progressiveSummarize: { summarizeText },
    });

    const cfg: SlotConfig = {
      priority: 50,
      budget: { flex: true },
      overflow: 'summarize',
    };

    const out = await engine.resolve([slot('history', 50, budget, cfg, items)]);
    const resultChars = countByChars(out[0]!.content);

    expect(resultChars).toBeLessThanOrEqual(budget);
    expect(resultChars).toBeGreaterThan(budget * 0.1);
    expect(out[0]!.content.length).toBeGreaterThan(5);

    const summaryItems = out[0]!.content.filter(
      (i) => i.summarizes !== undefined && i.summarizes.length > 0,
    );
    expect(summaryItems.length).toBeGreaterThan(0);
  });

  it('passes targetTokens and budget-aware prompts to summarizeText', async () => {
    const { summarizeText, calls } = makeDeterministicSummarizer();

    const items: ContentItem[] = [];
    for (let i = 0; i < 30; i++) {
      items.push(
        createContentItem({
          slot: 'h',
          role: 'user',
          content: `msg ${String(i)} ${'content '.repeat(20)}`,
          createdAt: 1000 + i * 1000,
        }),
      );
    }

    const engine = new OverflowEngine({
      countTokens: countByChars,
      progressiveSummarize: { summarizeText },
    });

    const cfg: SlotConfig = {
      priority: 50,
      budget: { flex: true },
      overflow: 'summarize',
      overflowConfig: { preserveLastN: 4 },
    };

    await engine.resolve([slot('h', 50, 1000, cfg, items)]);

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.targetTokens).toBeTypeOf('number');
      expect(call.targetTokens).toBeGreaterThan(0);
      expect(call.prompt).toContain('Target output length');
    }
  });

  it('retains answer-bearing content in summaries', async () => {
    const items: ContentItem[] = [];
    for (let i = 0; i < 50; i++) {
      items.push(
        createContentItem({
          slot: 'h',
          role: i % 2 === 0 ? 'user' : 'assistant',
          content:
            i === 35
              ? 'The answer is Summer Vibes playlist with tracks by Artist X'
              : `generic turn ${String(i)} ${'filler content '.repeat(5)}`,
          createdAt: 1000 + i * 1000,
        }),
      );
    }

    const summarizeText = vi.fn(
      async ({ userPayload, targetTokens }: {
        layer: number;
        systemPrompt: string;
        userPayload: string;
        targetTokens?: number;
      }) => {
        const target = targetTokens ?? 100;
        if (userPayload.includes('Summer Vibes')) {
          return ('Summer Vibes playlist. ').repeat(
            Math.max(1, Math.floor(target / 25)),
          ).slice(0, target);
        }
        return 'facts. '.repeat(Math.max(1, Math.floor(target / 7))).slice(0, target);
      },
    );

    const engine = new OverflowEngine({
      countTokens: countByChars,
      progressiveSummarize: { summarizeText },
    });

    const cfg: SlotConfig = {
      priority: 50,
      budget: { flex: true },
      overflow: 'summarize',
      overflowConfig: { preserveLastN: 4 },
    };

    const out = await engine.resolve([slot('h', 50, 2000, cfg, items)]);
    const allContent = out[0]!.content
      .map((i) => (typeof i.content === 'string' ? i.content : ''))
      .join(' ');

    expect(allContent).toContain('Summer Vibes');
  });

  it('proactive compression fires and produces summary items', async () => {
    const { summarizeText } = makeDeterministicSummarizer();

    const items: ContentItem[] = [];
    for (let i = 0; i < 10; i++) {
      items.push(
        createContentItem({
          slot: 'h',
          role: 'user',
          content: `turn ${String(i)} ${'data '.repeat(16)}`,
          createdAt: 1000 + i * 1000,
        }),
      );
    }

    const totalChars = countByChars(items);
    const budget = Math.floor(totalChars * 1.15);

    const engine = new OverflowEngine({
      countTokens: countByChars,
      progressiveSummarize: { summarizeText },
    });

    const cfg: SlotConfig = {
      priority: 50,
      budget: { flex: true },
      overflow: 'summarize',
      overflowConfig: { proactiveThreshold: 0.8, preserveLastN: 3 },
    };

    const out = await engine.resolve([slot('h', 50, budget, cfg, items)]);

    expect(summarizeText).toHaveBeenCalled();
    expect(
      out[0]!.content.some(
        (i) => i.summarizes !== undefined && i.summarizes.length > 0,
      ),
    ).toBe(true);
  });
});
