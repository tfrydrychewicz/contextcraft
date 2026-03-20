# Basic Chat

Minimal terminal chatbot using slotmux with OpenAI. No custom slots — uses the built-in `chat` preset.

## Setup

```bash
npm install
export OPENAI_API_KEY=sk-...
```

## Run

```bash
npm start
```

## What it demonstrates

- `createContext` with the `chat` preset (system + history slots)
- `Context.fromParsedConfig` for runtime context
- `ctx.system()`, `ctx.user()`, `ctx.assistant()` for message management
- `ctx.build()` to compile the context window
- `formatOpenAIMessages` to convert to OpenAI's API format
- `snapshot.meta` for token counts and utilization
