# Vue Chat

Vue 3 chat UI using slotmux's `reactiveContext` with a custom composable.

## Setup

```bash
npm install
```

## Run

```bash
npm run dev
```

Open http://localhost:5173.

To connect to a real LLM, replace the echo response in `App.vue` with a fetch call to your API.

## What it demonstrates

- `reactiveContext()` for reactive context management
- Custom Vue composable (`useSlotmux`) wrapping `ref.subscribe()` with Vue `ref()`
- Computed properties for utilization and token counts
- Automatic cleanup with `onUnmounted`
- Live status bar showing tokens, utilization, and build time
