# Agent with tools

This guide shows how to build an agent loop with tool calling using slotmux. You'll use dedicated slots for tool definitions, tool results, agent scratchpad, and conversation history.

## Context structure

The `agent` preset creates four slots:

| Slot | Priority | Budget | Position | Overflow | Purpose |
| --- | --- | --- | --- | --- | --- |
| `system` | 100 | fixed 2 000 | before | `error` | Agent instructions |
| `tools` | 85 | flex | before | `truncate` | Tool definitions and results |
| `scratchpad` | 65 | flex | interleave | `truncate` | Agent reasoning / chain-of-thought |
| `history` | 50 | flex | after | `summarize` | User/assistant conversation |

The compile order is: **system → tools → scratchpad → history**. Tool definitions appear early in the prompt so the model knows what tools are available.

```typescript
import { createContext, Context } from 'slotmux';

const { config } = createContext({
  model: 'gpt-4o',
  preset: 'agent',
  reserveForResponse: 4096,
  lazyContentItemTokens: true,
});

const ctx = Context.fromParsedConfig(config);
ctx.system(
  'You are a helpful agent. Use the provided tools to answer questions. ' +
  'Think step by step in the scratchpad before answering.'
);
```

## The tools plugin

`@slotmux/plugin-tools` manages tool definitions and results — automatically truncating large results and capping the number of retained tool outputs:

```bash
npm install @slotmux/plugin-tools
```

```typescript
import { toolsPlugin } from '@slotmux/plugin-tools';

const { config } = createContext({
  model: 'gpt-4o',
  preset: 'agent',
  reserveForResponse: 4096,
  lazyContentItemTokens: true,
  plugins: [
    toolsPlugin({
      maxToolResults: 10,
      truncateLargeResults: true,
      resultMaxTokens: 2000,
    }),
  ],
});
```

### Plugin options

| Option | Default | Description |
| --- | --- | --- |
| `slotName` | `'tools'` | Which slot to manage |
| `maxToolResults` | — | Max tool-role results kept (definitions not counted) |
| `truncateLargeResults` | `false` | Truncate tool results that exceed `resultMaxTokens` |
| `resultMaxTokens` | — | Token cap per tool result when truncating |
| `defaultSlot` | — | Slot config to inject if the slot doesn't exist |

## Registering tool definitions

Push tool definitions into the tools slot with the `tools.kind: 'definition'` metadata marker:

```typescript
ctx.push('tools', [
  {
    content: JSON.stringify({
      type: 'function',
      function: {
        name: 'search_web',
        description: 'Search the web for current information.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
          },
          required: ['query'],
        },
      },
    }),
    role: 'function',
    metadata: { 'tools.kind': 'definition' },
    pinned: true,
  },
  {
    content: JSON.stringify({
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read a file from the filesystem.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path' },
          },
          required: ['path'],
        },
      },
    }),
    role: 'function',
    metadata: { 'tools.kind': 'definition' },
    pinned: true,
  },
]);
```

Pin definitions so they're never evicted during overflow.

## The agent loop

A typical agent loop runs until the model stops issuing tool calls:

```typescript
import { formatOpenAIMessages } from '@slotmux/providers';

async function agentLoop(userMessage: string) {
  ctx.user(userMessage);

  while (true) {
    const { snapshot } = await ctx.build();
    const messages = formatOpenAIMessages(snapshot.messages);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      tools: toolDefinitions,
    });

    const choice = response.choices[0];

    if (choice.finish_reason === 'stop') {
      const reply = choice.message.content;
      ctx.assistant(reply);
      return reply;
    }

    // Model wants to call tools
    if (choice.finish_reason === 'tool_calls') {
      // Store the assistant's tool-call message
      ctx.push('history', [{
        content: '',
        role: 'assistant',
        toolUses: choice.message.tool_calls.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          input: tc.function.arguments,
        })),
      }]);

      // Execute each tool and push results
      for (const toolCall of choice.message.tool_calls) {
        const result = await executeTool(toolCall.function.name, toolCall.function.arguments);

        ctx.push('tools', [{
          content: typeof result === 'string' ? result : JSON.stringify(result),
          role: 'tool',
          toolCallId: toolCall.id,
        }]);
      }
    }
  }
}
```

### What happens during overflow

As the agent loop runs, tool results accumulate. The tools plugin handles this:

1. **Large result truncation** — If `truncateLargeResults` is enabled, tool results exceeding `resultMaxTokens` are truncated with a `[truncated]` marker. The original token estimate is preserved in metadata.

2. **Result cap** — When `maxToolResults` is set, older tool results are dropped (newest kept). Pinned items and definitions are never counted toward the cap.

3. **Budget overflow** — If the tools slot still exceeds its budget after plugin processing, the slot's overflow strategy (default `truncate`) removes the oldest non-pinned results.

## Using the scratchpad

The scratchpad slot is positioned as `interleave` — its content is woven between the `before` and `after` slots. Use it for chain-of-thought reasoning:

```typescript
// After the model returns reasoning
ctx.push('scratchpad', [{
  content: 'The user is asking about file sizes. I should use read_file to check.',
  role: 'assistant',
}]);
```

The scratchpad uses `truncate` overflow, so older reasoning steps are dropped first. This keeps the most recent chain of thought while discarding stale reasoning from earlier iterations.

## Budget allocation

For agent workloads, consider giving tools a fixed or percent budget to ensure space for definitions:

```typescript
const { config } = createContext({
  model: 'gpt-4o',
  preset: 'agent',
  reserveForResponse: 4096,
  lazyContentItemTokens: true,
  slots: {
    tools: {
      priority: 85,
      budget: { percent: 30 },
      overflow: 'truncate',
      defaultRole: 'tool',
      position: 'before',
    },
    scratchpad: {
      priority: 65,
      budget: { flex: true, min: 500, max: 10000 },
      overflow: 'truncate',
      defaultRole: 'user',
      position: 'interleave',
      order: 10,
    },
  },
});
```

## Monitoring the agent

Use `snapshot.meta` to track how much budget each slot is using:

```typescript
const { snapshot } = await ctx.build();
const { tools, scratchpad, history } = snapshot.meta.slots;

console.log(`Tools: ${tools.usedTokens}/${tools.budgetTokens} (${tools.itemCount} items)`);
console.log(`Scratchpad: ${scratchpad.usedTokens}/${scratchpad.budgetTokens}`);
console.log(`History: ${history.usedTokens}/${history.budgetTokens}`);

if (snapshot.meta.utilization > 0.9) {
  console.warn('Context is 90%+ full — consider clearing the scratchpad');
}
```

## Next

- [Concepts: Slots](/concepts/slots) — slot positions and compile ordering.
- [Concepts: Overflow](/concepts/overflow) — all overflow strategies.
- [Custom plugin](./custom-plugin) — build your own plugin for agent-specific logic.
