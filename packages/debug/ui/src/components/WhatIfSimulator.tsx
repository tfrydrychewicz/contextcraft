/**
 * Drag budget multipliers to preview utilization.
 *
 * @packageDocumentation
 */

import { useEffect, useRef, useState } from 'preact/hooks';

import type { SerializedSnapshotWire } from '../types.js';

type Props = {
  readonly snapshot: SerializedSnapshotWire | null;
  readonly onFactorsChange: (factors: Readonly<Record<string, number>>) => void;
};

export function WhatIfSimulator({ snapshot, onFactorsChange }: Props) {
  const [factors, setFactors] = useState<Record<string, number>>({});
  const slotKeysSigRef = useRef<string>('');

  useEffect(() => {
    if (snapshot === null) {
      slotKeysSigRef.current = '';
      setFactors({});
      onFactorsChange({});
      return;
    }
    const keys = Object.keys(snapshot['meta']['slots']).sort().join('\0');
    if (keys === slotKeysSigRef.current) {
      return;
    }
    slotKeysSigRef.current = keys;
    setFactors((prev) => {
      const next: Record<string, number> = {};
      for (const name of Object.keys(snapshot['meta']['slots'])) {
        next[name] = prev[name] ?? 1;
      }
      return next;
    });
  }, [snapshot, onFactorsChange]);

  useEffect(() => {
    onFactorsChange(factors);
  }, [factors, onFactorsChange]);

  if (snapshot === null) {
    return (
      <div class="panel">
        <h2>What-if budgets</h2>
        <p class="muted">Run a build to simulate slot budget changes.</p>
      </div>
    );
  }

  const names = Object.keys(snapshot['meta']['slots']).sort();

  return (
    <div class="panel">
      <h2>What-if budgets</h2>
      <p class="muted" style={{ marginTop: 0 }}>
        Multiplier applies to resolved <strong>budget</strong> only (client-side preview).
      </p>
      <div class="whatif">
        {names.map((name) => (
          <div class="whatif__row" key={name}>
            <label htmlFor={`bf-${name}`}>{name}</label>
            <input
              id={`bf-${name}`}
              type="range"
              min="0.25"
              max="2"
              step="0.05"
              value={factors[name] ?? 1}
              onInput={(e) => {
                const v = Number((e.target as HTMLInputElement).value);
                setFactors((f) => ({ ...f, [name]: v }));
              }}
            />
            <span class="muted">×{(factors[name] ?? 1).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
