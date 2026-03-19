/**
 * Build pipeline: budget → overflow → compile → snapshot (§5.3 — Phase 5.4 stub for Phase 5.2).
 *
 * @packageDocumentation
 */

import type { ParsedContextConfig } from '../config/validator.js';
import { InvalidConfigError } from '../errors.js';
import { BudgetAllocator } from '../slots/budget-allocator.js';
import { OverflowEngine } from '../slots/overflow-engine.js';
import { sumCachedItemTokens } from '../slots/strategies/truncate-strategy.js';
import { createContentId, toTokenCount } from '../types/branded.js';
import type { SlotConfig } from '../types/config.js';
import type {
  CompiledContentPart,
  CompiledMessage,
  ContentItem,
  MultimodalContent,
} from '../types/content.js';
import type { ContextEvent } from '../types/events.js';
import type { ResolvedSlot } from '../types/plugin.js';
import type {
  ContextSnapshot,
  ContextWarning,
  EvictionEvent,
  SerializedSnapshot,
  SlotMeta,
  SnapshotDiff,
  SnapshotMeta,
} from '../types/snapshot.js';

import type { Context } from './context.js';

export type ContextOrchestratorBuildInput = {
  readonly config: ParsedContextConfig;
  readonly context: Context;
};

export type ContextOrchestratorBuildResult = {
  readonly snapshot: ContextSnapshot;
  readonly context: Context;
};

const DEFAULT_MAX_TOKENS = 8192;

/** Deterministic 256-bit-style hex fingerprint for {@link SerializedSnapshot.checksum} (sync, no Node crypto). */
function checksumHex(payload: string): string {
  const parts: string[] = [];
  let acc = payload;
  for (let r = 0; r < 8; r++) {
    let h = 2166136261;
    for (let i = 0; i < acc.length; i++) {
      h ^= acc.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    parts.push(h.toString(16).padStart(8, '0'));
    acc = `${h}:${payload}`;
  }
  return parts.join('');
}

function emitEvent(
  config: ParsedContextConfig,
  event: ContextEvent,
): void {
  const fn = config.onEvent as ((e: ContextEvent) => void) | undefined;
  fn?.(event);
}

function compileContentItem(item: ContentItem): CompiledMessage {
  if (typeof item.content === 'string') {
    return { role: item.role, content: item.content };
  }
  const parts: CompiledContentPart[] = [];
  for (const block of item.content as MultimodalContent[]) {
    if (block.type === 'text') {
      parts.push({ type: 'text', text: block.text });
    } else if (block.type === 'image_url') {
      const url = block.imageUrl ?? block.image_url ?? '';
      parts.push({
        type: 'image_url',
        image_url: { url },
      });
    } else {
      const data = block.imageBase64 ?? block.image_base64 ?? '';
      parts.push({
        type: 'image_base64',
        image_base64:
          block.mimeType !== undefined
            ? { data, mime_type: block.mimeType }
            : { data },
      });
    }
  }
  return { role: item.role, content: parts };
}

type SlotEntry = { readonly name: string; readonly config: SlotConfig };

function slotEntries(slots: Record<string, SlotConfig>): SlotEntry[] {
  return Object.entries(slots).map(([name, config]) => ({ name, config }));
}

/**
 * Order slots for compilation: `before` → `interleave` → `after` (§5.4 Step 8, simplified).
 */
export function orderSlotsForCompile(
  slots: Record<string, SlotConfig>,
): SlotEntry[] {
  const entries = slotEntries(slots);
  const pos = (c: SlotConfig): 'before' | 'after' | 'interleave' =>
    c.position ?? 'after';

  const before = entries
    .filter((e) => pos(e.config) === 'before')
    .sort(
      (a, b) =>
        b.config.priority - a.config.priority ||
        a.name.localeCompare(b.name),
    );
  const interleave = entries
    .filter((e) => pos(e.config) === 'interleave')
    .sort(
      (a, b) =>
        (a.config.order ?? 0) - (b.config.order ?? 0) ||
        b.config.priority - a.config.priority ||
        a.name.localeCompare(b.name),
    );
  const after = entries
    .filter((e) => pos(e.config) === 'after')
    .sort(
      (a, b) =>
        b.config.priority - a.config.priority ||
        a.name.localeCompare(b.name),
    );

  return [...before, ...interleave, ...after];
}

export function compileMessagesForSnapshot(
  slots: Record<string, SlotConfig>,
  resolvedSlots: readonly ResolvedSlot[],
): CompiledMessage[] {
  const byName = new Map(resolvedSlots.map((s) => [s.name, s.content]));
  const ordered = orderSlotsForCompile(slots);
  const out: CompiledMessage[] = [];
  for (const { name } of ordered) {
    const items = byName.get(name) ?? [];
    for (const item of items) {
      out.push(compileContentItem(item));
    }
  }
  return out;
}

function buildSlotMetaMap(params: {
  readonly slots: Record<string, SlotConfig>;
  readonly resolvedAfterOverflow: readonly ResolvedSlot[];
  readonly evictionsBySlot: ReadonlyMap<string, number>;
  readonly overflowSlots: ReadonlySet<string>;
}): Record<string, SlotMeta> {
  const o: Record<string, SlotMeta> = {};
  for (const rs of params.resolvedAfterOverflow) {
    const used = sumCachedItemTokens(rs.content);
    const budget = rs.budgetTokens;
    const evicted = params.evictionsBySlot.get(rs.name) ?? 0;
    const overflowTriggered = params.overflowSlots.has(rs.name);
    o[rs.name] = {
      name: rs.name,
      budgetTokens: toTokenCount(budget),
      usedTokens: toTokenCount(used),
      itemCount: rs.content.length,
      evictedCount: evicted,
      overflowTriggered,
      utilization: budget > 0 ? used / budget : 0,
    };
  }
  return o;
}

function cloneCompiledMessage(m: CompiledMessage): CompiledMessage {
  const out: CompiledMessage = {
    role: m.role,
    content: typeof m.content === 'string' ? m.content : [...m.content],
  };
  if (m.name !== undefined) {
    out.name = m.name;
  }
  return out;
}

function createContextSnapshotImpl(params: {
  readonly messages: readonly CompiledMessage[];
  readonly meta: SnapshotMeta;
  readonly model: string;
}): ContextSnapshot {
  const id = createContentId();
  const messageList = params.messages.map(cloneCompiledMessage);
  const meta = { ...params.meta };

  const snapshot: ContextSnapshot = {
    id,
    get messages(): readonly Readonly<CompiledMessage>[] {
      return messageList as readonly Readonly<CompiledMessage>[];
    },
    meta,
    format(_provider) {
      return messageList.map(cloneCompiledMessage);
    },
    serialize(): SerializedSnapshot {
      const payload = JSON.stringify({
        messages: messageList,
        meta,
        model: params.model,
      });
      const checksum = checksumHex(payload);
      return {
        version: '1.0',
        id,
        model: params.model,
        slots: { ...meta.slots },
        messages: messageList.map(cloneCompiledMessage),
        meta,
        checksum,
      };
    },
    diff(other: ContextSnapshot): SnapshotDiff {
      const added: CompiledMessage[] = [];
      const removed: CompiledMessage[] = [];
      const modified: Array<{
        index: number;
        before: Readonly<CompiledMessage>;
        after: Readonly<CompiledMessage>;
      }> = [];
      const a = messageList;
      const b = other.messages;
      const min = Math.min(a.length, b.length);
      for (let i = 0; i < min; i++) {
        if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) {
          modified.push({
            index: i,
            before: a[i]!,
            after: b[i]!,
          });
        }
      }
      if (a.length > b.length) {
        for (let i = b.length; i < a.length; i++) {
          removed.push(a[i]!);
        }
      }
      if (b.length > a.length) {
        for (let i = a.length; i < b.length; i++) {
          added.push(b[i]!);
        }
      }
      return { added, removed, modified };
    },
  };

  return snapshot;
}

/**
 * Runs budget resolution, overflow, message compilation, and snapshot materialization.
 * Plugin hooks from §5.4 are reserved for a later iteration.
 */
export class ContextOrchestrator {
  static async build(
    input: ContextOrchestratorBuildInput,
  ): Promise<ContextOrchestratorBuildResult> {
    const t0 = Date.now();
    const { config, context } = input;
    const slots = config.slots as Record<string, SlotConfig>;
    if (config.slots === undefined || Object.keys(config.slots).length === 0) {
      throw new InvalidConfigError('ContextOrchestrator.build: config.slots is required', {
        context: { phase: '5.2' },
      });
    }

    const maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
    const reserve = config.reserveForResponse ?? 0;
    const totalBudget = Math.max(0, maxTokens - reserve);

    emitEvent(config, { type: 'build:start', totalBudget });

    const evictionsBySlot = new Map<string, number>();
    const overflowSlots = new Set<string>();
    const warnings: ContextWarning[] = [];
    const evictionsMeta: EvictionEvent[] = [];

    const forward = (e: ContextEvent): void => {
      emitEvent(config, e);
      if (e.type === 'content:evicted') {
        evictionsBySlot.set(e.slot, (evictionsBySlot.get(e.slot) ?? 0) + 1);
        evictionsMeta.push({
          slot: e.slot,
          item: e.item,
          reason: e.reason,
        });
      } else if (e.type === 'slot:overflow') {
        overflowSlots.add(e.slot);
      } else if (e.type === 'warning') {
        warnings.push(e.warning);
      }
    };

    const allocator = new BudgetAllocator({
      onEvent: (e) => forward(e),
    });
    const budgetResolved = allocator.resolve(slots, totalBudget);

    const countTokens = (items: readonly ContentItem[]): number =>
      sumCachedItemTokens(items);

    const engine = new OverflowEngine({
      countTokens,
      onEvent: (e) => forward(e),
    });

    const overflowInputs = budgetResolved.map((rs) => ({
      name: rs.name,
      priority: rs.priority,
      budgetTokens: rs.budgetTokens,
      config: slots[rs.name]!,
      content: context.getItems(rs.name),
    }));

    const afterOverflow = await engine.resolve(overflowInputs, {
      totalBudget,
    });

    const messages = compileMessagesForSnapshot(slots, afterOverflow);

    const slotMeta = buildSlotMetaMap({
      slots,
      resolvedAfterOverflow: afterOverflow,
      evictionsBySlot,
      overflowSlots,
    });

    let totalUsed = 0;
    let waste = 0;
    for (const rs of afterOverflow) {
      const u = sumCachedItemTokens(rs.content);
      totalUsed += u;
      waste += Math.max(0, rs.budgetTokens - u);
    }

    const buildTimeMs = Date.now() - t0;
    const builtAt = Date.now();

    const snapshotMeta: SnapshotMeta = {
      totalTokens: toTokenCount(totalUsed),
      totalBudget: toTokenCount(totalBudget),
      utilization: totalBudget > 0 ? totalUsed / totalBudget : 0,
      waste: toTokenCount(waste),
      slots: Object.freeze(slotMeta),
      compressions: Object.freeze([]),
      evictions: Object.freeze(evictionsMeta),
      warnings: Object.freeze(warnings),
      buildTimeMs,
      builtAt,
    };

    const snapshot = createContextSnapshotImpl({
      messages,
      meta: snapshotMeta,
      model: config.model,
    });

    context.clearEphemeral();

    emitEvent(config, { type: 'build:complete', snapshot });

    return { snapshot, context };
  }
}
