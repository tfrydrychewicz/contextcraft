/**
 * Vitest bench tasks for `Context.build()` scenarios (§17.5).
 *
 * Contexts are created once at module load (TinyBench does not run `beforeAll` before iterations).
 * Each iteration times only {@link Context.build}.
 *
 * @packageDocumentation
 */

import { bench, describe } from 'vitest';

import { createContextForScenario } from './scenario-builds.js';

const smallChatCtx = createContextForScenario('small-chat');
const largeRagCtx = createContextForScenario('large-rag');
const agentLoopCtx = createContextForScenario('agent-loop');
const stressCtx = createContextForScenario('stress-test');

describe('Context build benchmark — small-chat (50 messages, 2 slots)', () => {
  bench('Context.build()', async () => {
    await smallChatCtx.build();
  });
});

describe('Context build benchmark — large-rag (500 chunks, 5 slots)', () => {
  bench('Context.build()', async () => {
    await largeRagCtx.build();
  });
});

describe('Context build benchmark — agent-loop (200 tool messages, 4 slots)', () => {
  bench('Context.build()', async () => {
    await agentLoopCtx.build();
  });
});

describe('Context build benchmark — stress-test (10_000 messages, 10 slots)', () => {
  bench('Context.build()', async () => {
    await stressCtx.build();
  });
});
