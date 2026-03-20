/**
 * Content / pipeline event timeline.
 *
 * @packageDocumentation
 */

import type { InspectorEventWire, TimedInspectorEvent } from '../types.js';

type Props = {
  readonly events: readonly TimedInspectorEvent[];
};

function summarize(ev: InspectorEventWire): string {
  const t = ev['type'];
  const slot = typeof ev['slot'] === 'string' ? ev['slot'] : '';
  switch (t) {
    case 'content:added': {
      return `Added to ${slot || '?'}`;
    }
    case 'content:evicted': {
      const reason = typeof ev['reason'] === 'string' ? ev['reason'] : '';
      return `Evicted from ${slot || '?'}${reason ? ` · ${reason}` : ''}`;
    }
    case 'content:pinned': {
      return `Pinned in ${slot || '?'}`;
    }
    case 'slot:overflow': {
      const strat = typeof ev['strategy'] === 'string' ? ev['strategy'] : '';
      return `Overflow ${slot || '?'}${strat ? ` · ${strat}` : ''}`;
    }
    case 'slot:budget-resolved': {
      const bt = ev['budgetTokens'];
      return `Budget resolved ${slot || '?'}${typeof bt === 'number' ? ` → ${bt} tok` : ''}`;
    }
    case 'compression:start': {
      const n = ev['itemCount'];
      return `Compress start ${slot || '?'}${typeof n === 'number' ? ` (${n} items)` : ''}`;
    }
    case 'compression:complete': {
      const before = ev['beforeTokens'];
      const after = ev['afterTokens'];
      return `Compress done ${slot || '?'}${typeof before === 'number' && typeof after === 'number' ? ` ${before}→${after}` : ''}`;
    }
    case 'build:start': {
      const tb = ev['totalBudget'];
      return `Build start${typeof tb === 'number' ? ` · budget ${tb}` : ''}`;
    }
    case 'build:complete': {
      return 'Build complete';
    }
    case 'warning': {
      const w = ev['warning'];
      if (w !== null && typeof w === 'object' && typeof (w as { message?: string }).message === 'string') {
        return `Warning: ${(w as { message: string }).message}`;
      }
      return 'Warning';
    }
    default: {
      return slot ? `${t} · ${slot}` : t;
    }
  }
}

function formatTime(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(ms);
  }
}

export function Timeline({ events }: Props) {
  const rows = [...events].reverse();

  return (
    <div class="panel">
      <h2>Event timeline</h2>
      <div class="timeline">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Time</th>
              <th>Type</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} class="muted">
                  No events yet.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={`${row.receivedAt}-${rows.length - i}`}>
                  <td>{rows.length - i}</td>
                  <td>{formatTime(row.receivedAt)}</td>
                  <td>
                    <code>{row.event['type']}</code>
                  </td>
                  <td>{summarize(row.event)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
