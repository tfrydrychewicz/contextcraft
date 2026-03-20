# Next.js Chatbot

Full-stack chatbot built with Next.js 15 App Router and slotmux.

## Setup

```bash
npm install
export OPENAI_API_KEY=sk-...
```

## Run

```bash
npm run dev
```

Open http://localhost:3000.

## What it demonstrates

- Server-side context management in a Next.js API route (`/api/chat`)
- `createContext` with the `chat` preset on every request
- Rebuilding full conversation history from client state
- Token count and utilization displayed in the UI
- `formatOpenAIMessages` for provider formatting
