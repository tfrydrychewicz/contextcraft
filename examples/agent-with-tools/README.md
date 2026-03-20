# Agent with Tools

Agent loop with function calling using slotmux and OpenAI.

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

- `createContext` with the `agent` preset (system + tools + scratchpad + history slots)
- Multi-round tool loop: the agent calls tools, results are pushed back into context
- Tool call recording with `toolUses` and `toolCallId` on content items
- Automatic context management across multiple tool rounds
