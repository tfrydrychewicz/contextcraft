import { describe, expect, it } from 'vitest';

import { validateContextConfig } from '../../src/config/validator.js';
import { InvalidConfigError } from '../../src/errors.js';

describe('config: lazy vs char estimate', () => {
  it('rejects lazyContentItemTokens together with charTokenEstimateForMissing', () => {
    expect(() =>
      validateContextConfig({
        model: 'gpt-4o-mini',
        maxTokens: 8000,
        lazyContentItemTokens: true,
        charTokenEstimateForMissing: true,
        slots: {
          h: {
            priority: 1,
            budget: { flex: true },
            defaultRole: 'user',
            position: 'after',
            overflow: 'truncate',
          },
        },
      }),
    ).toThrow(InvalidConfigError);
  });
});
