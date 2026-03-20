# Multi-model and provider switching

Slotmux separates context assembly from provider wire format. You define slots, push content, and call `build()` — then format the snapshot for whichever API you're targeting. This guide shows how to work with multiple models and providers.

## Provider formatters

After building a snapshot, convert its messages to any supported provider format:

```typescript
import {
  formatOpenAIMessages,
  formatAnthropicMessages,
  formatGeminiMessages,
  formatOllamaMessages,
  formatMistralMessages,
} from '@slotmux/providers';

const { snapshot } = await ctx.build();

// OpenAI / Azure OpenAI
const openaiMessages = formatOpenAIMessages(snapshot.messages);

// Anthropic Claude
const anthropicPayload = formatAnthropicMessages(snapshot.messages);
// → { system?: string, messages: [...] }  (system extracted separately)

// Google Gemini
const geminiPayload = formatGeminiMessages(snapshot.messages);

// Ollama (local models)
const ollamaMessages = formatOllamaMessages(snapshot.messages);

// Mistral (same shape as OpenAI)
const mistralMessages = formatMistralMessages(snapshot.messages);
```

Each formatter handles provider-specific quirks:

| Formatter | Handles |
| --- | --- |
| `formatOpenAIMessages` | `tool_call_id`, multimodal content blocks |
| `formatAnthropicMessages` | Extracts system prompt, collapses consecutive same-role messages, maps tool use blocks |
| `formatGeminiMessages` | Converts to `parts` format, collapses consecutive roles, maps tool calls |
| `formatOllamaMessages` | Maps `toolUses` to `tool_calls` |
| `formatMistralMessages` | Alias of `formatOpenAIMessages` |

### Anthropic system prompt extraction

Anthropic's API expects the system prompt as a separate parameter, not in the messages array. `formatAnthropicMessages` handles this automatically:

```typescript
const payload = formatAnthropicMessages(snapshot.messages);

const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  system: payload.system,
  messages: payload.messages,
  max_tokens: 4096,
});
```

## The model registry

Slotmux ships a built-in model registry that maps model IDs to capabilities:

```typescript
import { createContext } from 'slotmux';

// Automatically resolves maxTokens, provider, and tokenizer
const { config: gptConfig } = createContext({ model: 'gpt-4o' });
// → maxTokens: 128000, provider: 'openai'

const { config: claudeConfig } = createContext({ model: 'claude-sonnet-4-20250514' });
// → maxTokens: 200000, provider: 'anthropic'

const { config: geminiConfig } = createContext({ model: 'gemini-2.0-flash' });
// → maxTokens: 1048576, provider: 'google'
```

The registry uses prefix matching — `gpt-4o-mini`, `gpt-4o-2024-08-06`, etc. all resolve through the `gpt-4o` family.

### Registering custom models

For local models or providers not in the registry:

```typescript
import { registerModel } from 'slotmux';

registerModel('my-local-llama', {
  maxTokens: 8192,
  provider: 'ollama',
});

const { config } = createContext({ model: 'my-local-llama' });
```

## Same context, different providers

The core pattern: build once, format for any provider.

```typescript
import { createContext, Context } from 'slotmux';
import { formatOpenAIMessages, formatAnthropicMessages } from '@slotmux/providers';

const { config } = createContext({
  model: 'gpt-4o',
  preset: 'chat',
  reserveForResponse: 4096,
  lazyContentItemTokens: true,
});

const ctx = Context.fromParsedConfig(config);
ctx.system('You are a helpful assistant.');
ctx.user('Explain TypeScript generics.');

const { snapshot } = await ctx.build();

// Same snapshot → different wire formats
const forOpenAI = formatOpenAIMessages(snapshot.messages);
const forAnthropic = formatAnthropicMessages(snapshot.messages);
```

## Switching models mid-conversation

When you need to switch models (e.g. from a fast model for simple queries to a powerful model for complex ones), create a new context with the new model and replay the conversation:

```typescript
function switchModel(
  currentCtx: Context,
  newModel: string,
) {
  const { config: newConfig } = createContext({
    model: newModel,
    preset: 'chat',
    reserveForResponse: 4096,
    lazyContentItemTokens: true,
  });

  const newCtx = Context.fromParsedConfig(newConfig);

  // Replay messages from the current context's last snapshot
  // (or re-push from your own message store)
  return newCtx;
}
```

Because `maxTokens` differs between models (e.g. 128K for GPT-4o vs. 200K for Claude), the budget allocation automatically adjusts. Your slot definitions stay the same — only the available token pool changes.

## Provider adapters

For advanced use cases, you can register provider adapters that are used during the build pipeline for tokenizer resolution and snapshot formatting:

```typescript
import { createOpenAIAdapter } from '@slotmux/providers';

const { snapshot } = await ctx.build({
  providerAdapters: {
    openai: createOpenAIAdapter(),
  },
});

// Use snapshot.format() instead of standalone formatters
const messages = snapshot.format('openai');
```

Available adapter factories:

| Factory | Provider |
| --- | --- |
| `createOpenAIAdapter()` | OpenAI / Azure OpenAI |
| `createAnthropicAdapter()` | Anthropic Claude |
| `createGoogleAdapter()` | Google Gemini |
| `createMistralAdapter()` | Mistral AI |
| `createOllamaAdapter()` | Ollama (local) |

## Build-time overrides

Override token budgets per build without changing the base config:

```typescript
// Use more response tokens for code generation
const { snapshot: codeSnapshot } = await ctx.build({
  overrides: {
    reserveForResponse: 16384,
  },
});

// Use fewer for quick answers
const { snapshot: quickSnapshot } = await ctx.build({
  overrides: {
    reserveForResponse: 1024,
  },
});
```

## Next

- [Concepts: Budgets](/concepts/budgets) — how token allocation works across models.
- [Concepts: Snapshots](/concepts/snapshots) — snapshot formatting and serialization.
- [Custom plugin](./custom-plugin) — build a plugin for provider-specific logic.
