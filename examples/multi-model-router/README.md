# Multi-Model Router

Same context, same question — sent to both OpenAI and Anthropic. Demonstrates slotmux's provider-agnostic architecture.

## Setup

```bash
npm install
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
```

Set at least one key. Both are used if available.

## Run

```bash
npm start
```

## What it demonstrates

- Build context once with `ctx.build()`
- Format the same snapshot for OpenAI with `formatOpenAIMessages`
- Format the same snapshot for Anthropic with `formatAnthropicMessages`
- Compare responses side by side from different providers
