/**
 * Snapshot types for compiled context state.
 *
 * @packageDocumentation
 */

import type { TokenCount } from './branded.js';
import type { ModelId } from './config.js';
import type { CompiledMessage, ContentItem } from './content.js';

// ==========================================
// Slot Meta
// ==========================================

/** Per-slot metadata in a snapshot */
export interface SlotMeta {
  /** Slot name */
  readonly name: string;

  /** Resolved budget in tokens */
  readonly budgetTokens: TokenCount;

  /** Actual tokens used */
  readonly usedTokens: TokenCount;

  /** Number of content items in the slot */
  readonly itemCount: number;

  /** Number of items evicted during overflow */
  readonly evictedCount: number;

  /** Whether overflow strategy was triggered */
  readonly overflowTriggered: boolean;

  /** Utilization of this slot (usedTokens / budgetTokens) */
  readonly utilization: number;
}

// ==========================================
// Compression & Eviction Events
// ==========================================

/** Compression event that occurred during build */
export interface CompressionEvent {
  /** Slot where compression occurred */
  readonly slot: string;

  /** Tokens before compression */
  readonly beforeTokens: number;

  /** Tokens after compression */
  readonly afterTokens: number;

  /** Number of items compressed */
  readonly itemCount: number;

  /** Compression ratio (1 - afterTokens/beforeTokens) */
  readonly ratio?: number;
}

/** Content evicted during overflow resolution */
export interface EvictionEvent {
  /** Slot from which content was evicted */
  readonly slot: string;

  /** The evicted content item */
  readonly item: Readonly<ContentItem>;

  /** Reason for eviction */
  readonly reason: string;
}

// ==========================================
// Context Warning
// ==========================================

/** Warning emitted during build */
export interface ContextWarning {
  /** Warning code */
  readonly code: string;

  /** Human-readable message */
  readonly message: string;

  /** Slot involved (if applicable) */
  readonly slot?: string;

  /** Severity level */
  readonly severity: 'info' | 'warn' | 'error';
}

// ==========================================
// Snapshot Meta
// ==========================================

/** Comprehensive metadata about a compiled snapshot */
export interface SnapshotMeta {
  /** Total tokens used in this snapshot */
  readonly totalTokens: TokenCount;

  /** Total token budget available (maxTokens - reserveForResponse) */
  readonly totalBudget: TokenCount;

  /** Utilization ratio (0.0–1.0) */
  readonly utilization: number;

  /** Wasted budget (allocated but unused tokens across all slots) */
  readonly waste: TokenCount;

  /** Per-slot breakdown */
  readonly slots: Readonly<Record<string, SlotMeta>>;

  /** Compression events that occurred during this build */
  readonly compressions: readonly CompressionEvent[];

  /** Content items evicted during overflow resolution */
  readonly evictions: readonly EvictionEvent[];

  /** Warnings (e.g., slot over budget but protected, near-overflow) */
  readonly warnings: readonly ContextWarning[];

  /** Time taken to compile this snapshot (milliseconds) */
  readonly buildTimeMs: number;

  /** Timestamp */
  readonly builtAt: number;
}

// ==========================================
// Snapshot Diff
// ==========================================

/**
 * A slot whose {@link SlotMeta} differs between two snapshots (same slot name in both).
 *
 * @see {@link ContextSnapshot.diff}.
 */
export interface SnapshotSlotMetaDiff {
  readonly name: string;
  readonly before: Readonly<SlotMeta>;
  readonly after: Readonly<SlotMeta>;
}

/**
 * Diff result between two snapshots (§12.1).
 *
 * **Message semantics** for `this.diff(other)` (treat `this` as baseline, `other` as comparison):
 * - **`added`** — trailing messages in `other` beyond `this.messages.length` (append-only extension).
 * - **`removed`** — trailing messages in `this` beyond `other.messages.length` (truncation).
 * - **`modified`** — same index, different serialized message shape (see {@link CompiledMessage}).
 *
 * **Slots**: **`slotsModified`** lists slots present in both metas where any {@link SlotMeta} field differs.
 */
export interface SnapshotDiff {
  /** Messages present in `other` after the shared prefix vs `this` (longer `other`). */
  readonly added: readonly Readonly<CompiledMessage>[];

  /** Messages present in `this` after the shared prefix vs `other` (longer `this`). */
  readonly removed: readonly Readonly<CompiledMessage>[];

  /** Same index in both snapshots, different message JSON. */
  readonly modified: readonly Readonly<{
    readonly index: number;
    readonly before: Readonly<CompiledMessage>;
    readonly after: Readonly<CompiledMessage>;
  }>[];

  /** Slots whose metadata changed (budget, utilization, counts, overflow flag). */
  readonly slotsModified: readonly Readonly<SnapshotSlotMetaDiff>[];
}

// ==========================================
// Serialized Snapshot
// ==========================================

/** Serialized slot metadata (JSON-safe) */
export type SerializedSlot = SlotMeta;

/** Serialized message (JSON-safe, same structure as CompiledMessage) */
export type SerializedMessage = CompiledMessage;

/**
 * Serializable snapshot format for persistence (§12.1).
 * Checksum is SHA-256 (hex) of UTF-8 JSON payload built by {@link ContextSnapshot.serialize}
 * over `version`, `id`, `model`, `slots`, `messages`, and `meta` (the `checksum` field is excluded).
 */
export interface SerializedSnapshot {
  /** Schema version */
  version: '1.0';

  /** Snapshot identifier */
  id: string;

  /** Model identifier */
  model: ModelId;

  /** Slot metadata */
  slots: Record<string, SerializedSlot>;

  /** Compiled messages */
  messages: SerializedMessage[];

  /** Snapshot metadata */
  meta: SnapshotMeta;

  /** SHA-256 checksum for integrity verification */
  checksum: string;
}

// ==========================================
// Context Snapshot
// ==========================================

/** See {@link ContextSnapshot} class in `snapshot/context-snapshot.ts`. */
