import { describe, expect, it } from 'vitest';

import {
  TOKEN_OVERHEAD,
  getTokenOverhead,
  ollamaOverhead,
} from '../../src/index.js';

describe('TOKEN_OVERHEAD registry (§2.4 / §9.4)', () => {
  it('matches Phase 2.4 OpenAI constants', () => {
    expect(TOKEN_OVERHEAD.openai).toEqual({
      perMessage: 4,
      perConversation: 2,
      perName: 1,
    });
  });

  it('defines Anthropic, Google, Mistral, and Ollama entries', () => {
    expect(TOKEN_OVERHEAD.anthropic).toEqual({
      perMessage: 3,
      perConversation: 1,
      perName: 0,
    });
    expect(TOKEN_OVERHEAD.google).toEqual({
      perMessage: 4,
      perConversation: 2,
      perName: 0,
    });
    expect(TOKEN_OVERHEAD.mistral.perMessage).toBe(4);
    expect(TOKEN_OVERHEAD.mistral.perConversation).toBe(2);
    expect(TOKEN_OVERHEAD.mistral.perName).toBe(1);
    expect(TOKEN_OVERHEAD.ollama.perMessage).toBe(4);
  });

  it('getTokenOverhead returns openai for unknown ids', () => {
    expect(getTokenOverhead('acme-corp')).toBe(TOKEN_OVERHEAD.openai);
  });

  it('getTokenOverhead returns registry entry for known ids', () => {
    expect(getTokenOverhead('anthropic')).toBe(TOKEN_OVERHEAD.anthropic);
  });

  it('ollamaOverhead merges overrides onto defaults', () => {
    expect(ollamaOverhead({ perMessage: 0 })).toEqual({
      perMessage: 0,
      perConversation: 2,
      perName: 1,
    });
    expect(ollamaOverhead()).toEqual(TOKEN_OVERHEAD.ollama);
  });
});
