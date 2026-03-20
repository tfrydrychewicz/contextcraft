/**
 * §14.1 streaming build — typed emitter for {@link Context.buildStream}.
 *
 * @packageDocumentation
 */

import { TypedEventEmitter } from '../events/emitter.js';
import type { CompiledMessage } from '../types/content.js';

import type { ContextOrchestratorBuildResult } from './context-orchestrator.js';

/** Events emitted while a streaming build runs (§14.1). */
export type BuildStreamEvent =
  | { readonly type: 'slot:ready'; readonly slot: string; readonly messages: CompiledMessage[] }
  | { readonly type: 'complete'; readonly result: ContextOrchestratorBuildResult }
  | { readonly type: 'error'; readonly error: unknown };

/**
 * Observer for {@link Context.buildStream}. Prefer `event.type` + payload over Node’s `(slot, msg)` style.
 *
 * @example
 * ```ts
 * const stream = ctx.buildStream();
 * stream.on('slot:ready', (e) => {
 *   if (e.type === 'slot:ready') use(e.slot, e.messages);
 * });
 * stream.on('complete', (e) => {
 *   if (e.type === 'complete') useSnapshot(e.result.snapshot);
 * });
 * await stream.finished;
 * ```
 */
export class ContextBuildStream extends TypedEventEmitter<BuildStreamEvent> {
  private readonly _finished: Promise<ContextOrchestratorBuildResult>;

  private _resolveFinished!: (value: ContextOrchestratorBuildResult) => void;

  private _rejectFinished!: (reason: unknown) => void;

  constructor() {
    super();
    this._finished = new Promise((resolve, reject) => {
      this._resolveFinished = resolve;
      this._rejectFinished = reject;
    });
  }

  /** Resolves when the build finishes successfully (same payload as `complete`). */
  get finished(): Promise<ContextOrchestratorBuildResult> {
    return this._finished;
  }

  /** @internal */
  resolveFinished(result: ContextOrchestratorBuildResult): void {
    this.emit({ type: 'complete', result });
    this._resolveFinished(result);
  }

  /** @internal */
  rejectFinished(reason: unknown): void {
    this.emit({ type: 'error', error: reason });
    this._rejectFinished(reason);
  }
}

/**
 * Yields a macrotask so synchronous {@link Context.push} calls can run before the first slot, and async
 * work can run between `slot:ready` emissions.
 */
export function defaultStreamYield(): Promise<void> {
  if (typeof setImmediate === 'function') {
    return new Promise((resolve) => {
      setImmediate(resolve);
    });
  }
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
