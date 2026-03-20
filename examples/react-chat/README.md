# React Chat

React chat UI with `@slotmux/react` hooks for real-time context metadata display.

## Setup

```bash
npm install
```

## Run

```bash
npm run dev
```

Open http://localhost:5173.

To connect to a real LLM, replace the echo response in `App.tsx` with a fetch call to your API.

## What it demonstrates

- `reactiveContext()` for reactive context management
- `useReactiveContextMeta` hook for live token counts
- `useReactiveContextUtilization` hook for utilization percentage
- `useReactiveContextBuildError` hook for error state
- Per-slot token breakdown in the status bar
- Automatic rebuild on context changes
