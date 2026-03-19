/**
 * contextcraft — Intelligent Context Window Manager for AI Applications
 *
 * @packageDocumentation
 */

export const VERSION = '0.0.1';

// Branded types (§6.6)
export type { TokenCount, SlotPriority, ContentId } from './types/branded.js';
export {
  toTokenCount,
  isTokenCount,
  toSlotPriority,
  isSlotPriority,
  toContentId,
  createContentId,
  isContentId,
} from './types/branded.js';

// Configuration types (§6.6)
export type {
  ProviderId,
  ModelId,
  MessageRole,
  ContentItem,
  MultimodalContentStub,
  ContextEvent,
  ContextPlugin,
  SlotBudget,
  SlotBudgetFixed,
  SlotBudgetPercent,
  SlotBudgetFlex,
  SlotBudgetBoundedFlex,
  OverflowContext,
  OverflowStrategyFn,
  SummarizerFn,
  SlotOverflowStrategy,
  OverflowConfig,
  SlotConfig,
  ProviderConfig,
  TokenizerConfig,
  ContextConfig,
} from './types/config.js';
