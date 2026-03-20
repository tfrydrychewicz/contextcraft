/**
 * Token budget allocation waterfall.
 *
 * @packageDocumentation
 */

import type { SerializedSnapshotWire, SlotMetaWire } from '../types.js';

const PALETTE = ['#5b9fd4', '#8ec5fc', '#67c23a', '#e6a23c', '#b37feb', '#f56c6c', '#909399'];

type Props = {
  readonly snapshot: SerializedSnapshotWire | null;
};

export function Waterfall({ snapshot }: Props) {
  if (snapshot === null) {
    return (
      <div class="panel">
        <h2>Budget waterfall</h2>
        <p class="muted">Awaiting snapshot.</p>
      </div>
    );
  }

  const meta = snapshot['meta'];
  const totalBudget = Math.max(1, meta['totalBudget']);
  const names = Object.keys(meta['slots']).sort();

  return (
    <div class="panel">
      <h2>Budget waterfall</h2>
      <p class="muted" style={{ marginTop: 0 }}>
        Share of total budget ({totalBudget} tok) by resolved slot budget.
      </p>
      <div class="waterfall">
        {names.map((name, i) => {
          const sm = meta['slots'][name] as SlotMetaWire;
          const w = (sm.budgetTokens / totalBudget) * 100;
          const bg = PALETTE[i % PALETTE.length];
          return (
            <div
              class="waterfall__seg"
              key={name}
              style={{
                width: `${w}%`,
                background: bg,
              }}
              title={`${name}: ${sm.budgetTokens} tok budget`}
            >
              {w > 8 ? name.slice(0, 3) : ''}
            </div>
          );
        })}
      </div>
    </div>
  );
}
