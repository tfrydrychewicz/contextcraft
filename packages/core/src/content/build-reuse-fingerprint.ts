/**
 * Stable fingerprint of slot contents for {@link Context.build} reuse (§18.2 incremental builds).
 *
 * Omits {@link ContentItem.tokens} so lazy-filled counts do not invalidate reuse.
 *
 * @packageDocumentation
 */

import type { ContentItem } from '../types/content.js';

/** Minimal surface needed for {@link computeBuildReuseFingerprint} (avoids circular imports). */
export type BuildReuseFingerprintSource = {
  readonly registeredSlots: readonly string[];
  getItems(slot: string): readonly ContentItem[];
};

function stableItemWire(item: ContentItem): unknown {
  return {
    id: item.id,
    role: item.role,
    content: item.content,
    slot: item.slot,
    pinned: item.pinned,
    ephemeral: item.ephemeral,
    name: item.name,
    toolCallId: item.toolCallId,
    toolUses: item.toolUses,
    metadata: item.metadata,
    summarizes: item.summarizes,
    losslessLocale: item.losslessLocale,
  };
}

/**
 * JSON signature of all registered slots’ items (sorted slot names), excluding cached token counts.
 */
export function computeBuildReuseFingerprint(source: BuildReuseFingerprintSource): string {
  const names = [...source.registeredSlots].sort();
  const payload: Record<string, unknown> = {};
  for (const slot of names) {
    payload[slot] = source.getItems(slot).map(stableItemWire);
  }
  return JSON.stringify(payload);
}
