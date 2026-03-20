import { describe, it, expect } from 'vitest';

import { VERSION } from './index';

describe('@slotmux/debug', () => {
  it('exports version', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
