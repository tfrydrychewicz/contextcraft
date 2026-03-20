import { describe, expect, it } from 'vitest';

import { toolsPlugin, VERSION } from './index.js';

describe('@slotmux/plugin-tools', () => {
  it('exports version', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('toolsPlugin has name and hooks', () => {
    const p = toolsPlugin();
    expect(p.name).toContain('plugin-tools');
    expect(p.prepareSlots).toBeDefined();
    expect(p.beforeOverflow).toBeDefined();
  });
});
