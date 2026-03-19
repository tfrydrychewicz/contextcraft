/**
 * §3.4 / §17.4 — budget allocator invariants (property-based).
 */

import * as fc from 'fast-check';
import { describe, it } from 'vitest';

import { BudgetAllocator } from '../../src/index.js';
import type { SlotConfig } from '../../src/types/config.js';

describe('BudgetAllocator invariants (property)', () => {
  it('total allocated never exceeds totalBudget (§17.4)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50_000 }),
        fc.integer({ min: 0, max: 6 }),
        fc.integer({ min: 0, max: 6 }),
        (total, nf, np) => {
          const slots: Record<string, SlotConfig> = {};
          const denom = Math.max(1, nf + np + 1);
          const fixedEach = Math.floor(total / denom);

          for (let i = 0; i < nf; i++) {
            slots[`fix${i}`] = {
              priority: 60 + i,
              budget: { fixed: fixedEach },
            };
          }

          let pSum = 0;
          for (let i = 0; i < np; i++) {
            const room = 100 - pSum;
            if (room <= 0) {
              break;
            }
            const p = Math.min(25, room);
            pSum += p;
            slots[`pct${i}`] = {
              priority: 50 - i,
              budget: { percent: p },
            };
          }

          slots['flexRest'] = { priority: 1, budget: { flex: true } };

          try {
            const r = new BudgetAllocator().resolve(slots, total);
            const sum = r.reduce((s, x) => s + x.budgetTokens, 0);
            return sum <= total;
          } catch {
            return true;
          }
        },
      ),
      { numRuns: 120 },
    );
  });

  it('plain flex: higher priority receives >= lower priority (§17.4)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 8 }), fc.integer({ min: 10, max: 8000 }), (nFlex, total) => {
        const slots: Record<string, SlotConfig> = {};
        for (let i = 0; i < nFlex; i++) {
          slots[`f${i}`] = {
            priority: 5 * (i + 1),
            budget: { flex: true },
          };
        }

        const r = new BudgetAllocator().resolve(slots, total);

        const tok = (i: number) => r.find((s) => s.name === `f${i}`)!.budgetTokens;

        for (let i = 0; i < nFlex - 1; i++) {
          if (tok(i + 1) < tok(i)) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: 120 },
    );
  });
});
