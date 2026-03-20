/**
 * @contextcraft/providers — LLM provider adapters
 *
 * @packageDocumentation
 */

export const VERSION = '0.0.1';

export {
  createOpenAIAdapter,
  formatOpenAIMessages,
  OpenAIAdapter,
  orderSystemMessagesFirst,
} from './openai-adapter.js';
export type {
  OpenAIChatCompletionMessage,
  OpenAIChatContentPart,
} from './openai-adapter.js';
