/**
 * Progressive summarization (§8.1).
 *
 * @packageDocumentation
 */

import { nanoid } from 'nanoid';

import { getPlainTextForLossless } from './lossless-compressor.js';
import { DEFAULT_PROGRESSIVE_PROMPTS } from './progressive-prompts.js';
import type {
  ProgressiveItem,
  ProgressivePrompts,
  ProgressiveSummarizeTextFn,
} from './progressive-types.js';
import { partitionProgressiveZones } from './progressive-zones.js';

export type RunProgressiveSummarizeOptions = {
  readonly preserveLastN?: number;
  readonly summarizeText: ProgressiveSummarizeTextFn;
  readonly countItemsTokens: (items: readonly ProgressiveItem[]) => number;
  readonly countTextTokens: (text: string) => number;
  /**
   * Token budget for generated summary messages.
   * Summaries are instructed to fill this target. Default ~15% of `budgetTokens`, minimum 64.
   */
  readonly summaryBudgetTokens?: number;
  readonly slot: string;
  readonly prompts?: Partial<ProgressivePrompts>;
  readonly createId?: () => string;
  readonly now?: () => number;
};

function plain(item: ProgressiveItem): string {
  return getPlainTextForLossless(item);
}

function makeSummary(
  text: string,
  summarizes: readonly string[],
  slot: string,
  createId: () => string,
  createdAt: number,
): ProgressiveItem {
  const trimmed = text.trim();
  return {
    id: createId(),
    role: 'assistant',
    content: trimmed.length > 0 ? trimmed : '(empty summary)',
    slot,
    createdAt,
    summarizes: [...summarizes],
  };
}

/**
 * Appends a target-length instruction to a system prompt so the LLM
 * knows how much output to produce.
 */
function withTargetLength(systemPrompt: string, targetTokens: number): string {
  const approxWords = Math.floor(targetTokens * 0.75);
  return (
    systemPrompt +
    `\n\nTarget output length: approximately ${String(approxWords)} words (~${String(targetTokens)} tokens). ` +
    'Use the available space to preserve as many specific facts, names, numbers, dates, and user preferences as possible.'
  );
}

/**
 * Splits items into chunks of roughly `maxChunkTokens` each.
 */
function chunkZoneByTokenBudget(
  items: readonly ProgressiveItem[],
  maxChunkTokens: number,
  countItemsTokens: (items: readonly ProgressiveItem[]) => number,
): ProgressiveItem[][] {
  if (items.length === 0) return [];

  const chunks: ProgressiveItem[][] = [];
  let cur: ProgressiveItem[] = [];

  for (const item of items) {
    cur.push(item);
    if (countItemsTokens(cur) > maxChunkTokens && cur.length > 1) {
      const overflow = cur.pop()!;
      chunks.push(cur);
      cur = [overflow];
    }
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks;
}

/**
 * Runs progressive summarization until estimated token count is <= `budgetTokens`, or only pinned recent remain.
 *
 * When zones are large, items are chunked into segments of ~4-8K tokens and
 * each segment is summarized independently, producing multiple summary items
 * that collectively fill the summary budget.
 *
 * Order: `[...Layer2Summaries?, ...Layer1Summaries?, ...RECENT]` with summary `createdAt` just before the oldest RECENT message.
 */
export async function runProgressiveSummarize(
  items: readonly ProgressiveItem[],
  budgetTokens: number,
  options: RunProgressiveSummarizeOptions,
): Promise<ProgressiveItem[]> {
  const preserveLastN = options.preserveLastN ?? 4;
  const promptPack: ProgressivePrompts = {
    ...DEFAULT_PROGRESSIVE_PROMPTS,
    ...options.prompts,
  };
  const createId = options.createId ?? nanoid;
  const nowFn = options.now ?? Date.now;
  const { summarizeText } = options;
  const sumTok = (arr: readonly ProgressiveItem[]) => options.countItemsTokens(arr);

  const sorted = [...items].sort((a, b) => a.createdAt - b.createdAt);
  if (sumTok(sorted) <= budgetTokens) {
    return sorted;
  }

  const { old, middle, recent } = partitionProgressiveZones(sorted, preserveLastN);
  const summaryCap =
    options.summaryBudgetTokens ?? Math.max(64, Math.floor(budgetTokens * 0.15));

  const segmentSize = Math.min(8192, Math.max(2048, Math.floor(budgetTokens * 0.15)));

  const minRecentTime =
    recent.length > 0 ? Math.min(...recent.map((r) => r.createdAt)) : nowFn();
  let tick = 0;
  const nextSummaryTime = (): number => minRecentTime - 1000 - tick++ * 1000;

  let l2Summaries: ProgressiveItem[] = [];
  let l1Summaries: ProgressiveItem[] = [];

  const l2Cap = Math.floor(summaryCap * 0.55);
  const l1Cap = Math.floor(summaryCap * 0.45);

  if (old.length > 0) {
    const oldChunks = chunkZoneByTokenBudget(old, segmentSize, sumTok);
    const perChunkCap = Math.max(64, Math.floor(l2Cap / Math.max(1, oldChunks.length)));

    for (const chunk of oldChunks) {
      const payload = chunk.map(plain).filter((t) => t.length > 0).join('\n\n');
      if (payload.length === 0) continue;
      const text = await summarizeText({
        layer: 2,
        systemPrompt: withTargetLength(promptPack.layer2, perChunkCap),
        userPayload: payload,
        targetTokens: perChunkCap,
      });
      l2Summaries.push(
        makeSummary(text, chunk.map((x) => x.id), options.slot, createId, nextSummaryTime()),
      );
    }
  }

  if (middle.length > 0) {
    const midChunks = chunkZoneByTokenBudget(middle, segmentSize, sumTok);
    const perChunkCap = Math.max(64, Math.floor(l1Cap / Math.max(1, midChunks.length)));

    for (const chunk of midChunks) {
      const payload = chunk.map(plain).filter((t) => t.length > 0).join('\n\n');
      if (payload.length === 0) continue;
      const text = await summarizeText({
        layer: 1,
        systemPrompt: withTargetLength(promptPack.layer1, perChunkCap),
        userPayload: payload,
        targetTokens: perChunkCap,
      });
      l1Summaries.push(
        makeSummary(text, chunk.map((x) => x.id), options.slot, createId, nextSummaryTime()),
      );
    }
  }

  let recentWork = [...recent];
  const chain = (): ProgressiveItem[] => [...l2Summaries, ...l1Summaries, ...recentWork];
  let out = chain();

  if (sumTok(out) > budgetTokens && l2Summaries.length > 0) {
    const l2Payload = l2Summaries.map(plain).filter((t) => t.length > 0).join('\n\n');
    if (l2Payload.length > 0) {
      const l3Cap = Math.max(64, Math.floor(summaryCap * 0.15));
      const text = await summarizeText({
        layer: 3,
        systemPrompt: withTargetLength(promptPack.layer3, l3Cap),
        userPayload: l2Payload,
        targetTokens: l3Cap,
      });
      const priorIds = l2Summaries.flatMap((s) => [...(s.summarizes ?? []), s.id]);
      const l3 = makeSummary(text, priorIds, options.slot, createId, nextSummaryTime());
      l2Summaries = [l3];
      out = chain();
    }
  }

  while (sumTok(out) > budgetTokens) {
    const dropIdx = recentWork.findIndex((i) => !i.pinned);
    if (dropIdx < 0) {
      break;
    }
    recentWork = recentWork.filter((_, j) => j !== dropIdx);
    out = chain();
  }

  return out.sort((a, b) => a.createdAt - b.createdAt);
}
