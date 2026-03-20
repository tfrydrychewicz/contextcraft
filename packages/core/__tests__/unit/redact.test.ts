import { describe, expect, it } from 'vitest';

import {
  DEFAULT_REDACTION_PATTERNS,
  redactString,
  redactUnknown,
} from '../../src/logging/redact.js';

describe('redactString', () => {
  it('redacts SSN-like segments', () => {
    expect(redactString('id 123-45-6789 end')).toBe('id [REDACTED] end');
  });

  it('redacts email addresses', () => {
    expect(redactString('Contact a@b.co please')).toBe('Contact [REDACTED] please');
  });

  it('uses custom replacement', () => {
    expect(
      redactString('123-45-6789', DEFAULT_REDACTION_PATTERNS, '***'),
    ).toBe('***');
  });
});

describe('redactUnknown', () => {
  it('walks nested objects', () => {
    const out = redactUnknown({
      user: 'x@y.com',
      nested: { ssn: '123-45-6789' },
    }) as { user: string; nested: { ssn: string } };
    expect(out.user).toBe('[REDACTED]');
    expect(out.nested.ssn).toBe('[REDACTED]');
  });

  it('leaves numbers and null', () => {
    expect(redactUnknown({ n: 1, z: null })).toEqual({ n: 1, z: null });
  });
});
