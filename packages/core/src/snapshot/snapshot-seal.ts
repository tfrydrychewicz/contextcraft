/**
 * Canonical v1.0 wire payload and checksum sealing (§12.1 — shared by serialize, deserialize, migrate).
 *
 * @packageDocumentation
 */

import type { CompiledMessage } from '../types/content.js';
import type { SerializedSnapshot, SnapshotMeta } from '../types/snapshot.js';

import { sha256HexUtf8 } from './sha256-hex.js';

/** Same JSON shape as {@link ContextSnapshot.serialize} checksum input (checksum field excluded). */
export function snapshotV1PayloadString(params: {
  readonly id: string;
  readonly model: string;
  readonly slots: SerializedSnapshot['slots'];
  readonly messages: readonly CompiledMessage[];
  readonly meta: SnapshotMeta;
}): string {
  return JSON.stringify({
    version: '1.0' as const,
    id: params.id,
    model: params.model,
    slots: params.slots,
    messages: params.messages,
    meta: params.meta,
  });
}

/**
 * (Re)computes `checksum` for a v1.0 snapshot body. Drops any previous `checksum` on `input`.
 */
export function sealSerializedSnapshotV1(
  input: Omit<SerializedSnapshot, 'checksum'> & { readonly checksum?: string },
): SerializedSnapshot {
  const payload = snapshotV1PayloadString({
    id: input.id,
    model: input.model,
    slots: input.slots,
    messages: input.messages,
    meta: input.meta,
  });
  return {
    version: '1.0',
    id: input.id,
    model: input.model,
    slots: input.slots,
    messages: input.messages,
    meta: input.meta,
    checksum: sha256HexUtf8(payload),
  };
}
