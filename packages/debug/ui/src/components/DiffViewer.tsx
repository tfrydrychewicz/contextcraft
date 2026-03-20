/**
 * Side-by-side snapshot / slot meta diff (Phase 10.4).
 *
 * @packageDocumentation
 */

import type { SerializedSnapshotWire, SlotMetaWire } from '../types.js';

type Props = {
  readonly before: SerializedSnapshotWire | null;
  readonly after: SerializedSnapshotWire | null;
};

function slotsSummary(snap: SerializedSnapshotWire): string {
  const slots = snap['meta']['slots'];
  const lines: string[] = [];
  for (const name of Object.keys(slots).sort()) {
    const sm = slots[name] as SlotMetaWire;
    lines.push(
      `${name}: used ${sm.usedTokens} / budget ${sm.budgetTokens} · items ${sm.itemCount} · evicted ${sm.evictedCount} · overflow ${String(sm.overflowTriggered)}`,
    );
  }
  return lines.join('\n');
}

export function DiffViewer({ before, after }: Props) {
  if (before === null || after === null) {
    return (
      <div class="panel">
        <h2>Snapshot diff</h2>
        <p class="muted">
          Need two builds: the previous snapshot appears after the second successful <code>build:complete</code>.
        </p>
      </div>
    );
  }

  return (
    <div class="panel">
      <h2>Snapshot diff</h2>
      <p class="muted" style={{ marginTop: 0 }}>
        Messages: {before['messages'].length} → {after['messages'].length} · IDs:{' '}
        <code>{before['id'].slice(0, 8)}…</code> → <code>{after['id'].slice(0, 8)}…</code>
      </p>
      <div class="diff-grid">
        <div class="diff-col">
          <h3>Before</h3>
          <pre>{slotsSummary(before)}</pre>
        </div>
        <div class="diff-col">
          <h3>After</h3>
          <pre>{slotsSummary(after)}</pre>
        </div>
      </div>
    </div>
  );
}
