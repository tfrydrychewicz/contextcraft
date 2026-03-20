import { describe, it, expect } from 'vitest';

import { VERSION } from './index';

describe('@slotmux/providers', () => {
  it('exports version', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
