/**
 * Semantic compression: embed anchor + items, cosine similarity, greedy selection (§8.2 / Phase 8.5).
 *
 * @packageDocumentation
 */

import type { EmbedFunction, SemanticScorableItem } from './semantic-types.js';

export type RunSemanticCompressParams = {
  readonly items: readonly SemanticScorableItem[];
  /** Slot token budget (non-negative). */
  readonly budgetTokens: number;
  readonly embed: EmbedFunction;
  /** Text to embed as the relevance anchor (from last user message, system prompt, etc.). */
  readonly anchorText: string;
  /**
   * Minimum cosine similarity to consider a non-pinned item (0–1). Pinned items are always kept.
   * @defaultValue 0
   */
  readonly similarityThreshold?: number;
  /** Token estimate for a single item (aligned with overflow engine counter). */
  readonly countItemTokens: (item: SemanticScorableItem) => number;
};

/**
 * Cosine similarity of two same-length vectors. Empty or mismatched length → 0.
 */
export function cosineSimilarity(
  a: readonly number[],
  b: readonly number[],
): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Selects items: all **pinned** first, then non-pinned by descending similarity to the anchor
 * until the token budget is exhausted. Result sorted by `createdAt` ascending.
 */
export async function runSemanticCompress(
  params: RunSemanticCompressParams,
): Promise<readonly SemanticScorableItem[]> {
  const threshold = params.similarityThreshold ?? 0;
  const anchorIn = params.anchorText.trim();
  const anchorVec =
    anchorIn.length === 0 ? ([] as number[]) : await params.embed(anchorIn);

  const scored: { readonly item: SemanticScorableItem; readonly sim: number }[] = [];

  for (const item of params.items) {
    const t = item.text.trim();
    let sim = 0;
    if (t.length > 0 && anchorVec.length > 0) {
      const v = await params.embed(t);
      sim = cosineSimilarity(anchorVec, v);
    }
    scored.push({ item, sim });
  }

  const pinned = scored.filter((s) => s.item.pinned);
  const pool = scored.filter((s) => !s.item.pinned && s.sim >= threshold);
  pool.sort((a, b) => b.sim - a.sim || a.item.createdAt - b.item.createdAt);

  let used = 0;
  for (const s of pinned) {
    used += params.countItemTokens(s.item);
  }

  const chosen: SemanticScorableItem[] = pinned.map((s) => s.item);
  for (const s of pool) {
    const t = params.countItemTokens(s.item);
    if (used + t <= params.budgetTokens) {
      chosen.push(s.item);
      used += t;
    }
  }

  return chosen.sort((a, b) => a.createdAt - b.createdAt);
}
