import { describe, it, expect } from 'vitest';

import { VERSION } from './index';

describe('@ctxforge/compression', () => {
  it('exports version', () => {
    expect(VERSION).toBe('0.0.1');
  });
});
