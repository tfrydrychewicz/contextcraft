/**
 * Per-slot token usage vs budget.
 *
 * @packageDocumentation
 */

import type { SerializedSnapshotWire, SlotMetaWire } from '../types.js';

type Props = {
  readonly snapshot: SerializedSnapshotWire | null;
  /** Multiply displayed budget for “what-if” preview (slot name → factor). */
  readonly budgetFactors?: Readonly<Record<string, number>>;
};

function slotEntries(meta: SerializedSnapshotWire['meta']): [string, SlotMetaWire][] {
  return Object.keys(meta['slots'])
    .sort()
    .map((name) => [name, meta['slots'][name] as SlotMetaWire]);
}

export function SlotUtilization({ snapshot, budgetFactors }: Props) {
  if (snapshot === null) {
    return (
      <div class="panel">
        <h2>Slot utilization</h2>
        <p class="muted">No snapshot yet — run a build to see per-slot usage.</p>
      </div>
    );
  }

  const rows = slotEntries(snapshot['meta']);

  return (
    <div class="panel">
      <h2>Slot utilization</h2>
      {rows.map(([name, sm]) => {
        const factor = budgetFactors?.[name] ?? 1;
        const budget = Math.max(1, sm.budgetTokens * factor);
        const util = Math.min(1, sm.usedTokens / budget);
        const over = util > 1 || sm.overflowTriggered;
        const pct = Math.round(util * 1000) / 10;
        return (
          <div class="bar-row" key={name}>
            <div class="bar-row__label">
              <span>{name}</span>
              <span>
                {sm.usedTokens} / {Math.round(budget)} tok · {pct}%
                {factor !== 1 ? ` · factor ${factor.toFixed(2)}` : ''}
              </span>
            </div>
            <div class="bar-row__track">
              <div
                class={`bar-row__fill${over ? ' bar-row__fill--over' : ''}`}
                style={{ width: `${Math.min(100, util * 100)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
