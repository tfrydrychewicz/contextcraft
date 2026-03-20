# Reactive context

`reactiveContext()` wraps the imperative `Context` in a reactive layer that **automatically rebuilds** when content changes and exposes build results as **signal-shaped refs**. It's the foundation for real-time UIs that display context utilization, token counts, and build errors — without manually calling `build()`.

This guide covers the framework-agnostic API. For framework-specific integration, see [React](/guides/react), [Vue](/guides/vue), or [Angular](/guides/angular).

## Creating a reactive context

```typescript
import { reactiveContext } from 'slotmux/reactive';

const ctx = reactiveContext({
  model: 'gpt-4o-mini',
  maxTokens: 128_000,
  reserveForResponse: 4096,
  preset: 'chat',
  debounceMs: 50,
});

ctx.system('You are a helpful assistant.');
ctx.user('Hello!');
// Auto-rebuild fires ~50ms after the last mutation
```

`reactiveContext()` accepts the same options as `createContext()` plus reactive-specific settings.

## Reactive options

| Option | Default | Purpose |
| --- | --- | --- |
| `debounceMs` | `50` | Milliseconds to wait after the last mutation before auto-rebuilding |
| `defaultBuildParams` | — | Default `ContextBuildParams` passed to every `build()` |
| `onBuildError` | — | Callback when an auto-rebuild fails |

## Signal-shaped refs

A `ReactiveContext` exposes three reactive values:

```typescript
ctx.meta        // Ref<SnapshotMeta | undefined>
ctx.utilization // ReadonlyRef<number>
ctx.buildError  // Ref<Error | undefined>
```

Each ref has a `.value` property and a `.subscribe()` method:

```typescript
// Read the current value
console.log(ctx.meta.value?.totalTokens);
console.log(ctx.utilization.value);  // 0.0 until first build

// Subscribe to changes
const unsubscribe = ctx.meta.subscribe(() => {
  console.log('Meta updated:', ctx.meta.value?.utilization);
});

// Later
unsubscribe();
```

### `meta`

The full `SnapshotMeta` from the last successful build. Contains `totalTokens`, `totalBudget`, `utilization`, `buildTimeMs`, `builtAt`, `waste`, and per-slot metadata. `undefined` before the first build completes.

### `utilization`

A derived number (0–1) representing `meta.utilization`. Stays `0` until the first build. This is a convenience — it's equivalent to `ctx.meta.value?.utilization ?? 0`.

### `buildError`

The most recent build error, or `undefined` if the last build succeeded. Cleared on the next successful build.

## Debounced auto-rebuild

Every mutation (`system()`, `user()`, `assistant()`, `push()`, `pin()`, etc.) schedules a debounced `build()`. Multiple rapid mutations are coalesced into a single build after `debounceMs`:

```typescript
ctx.user('Message 1');
ctx.user('Message 2');
ctx.user('Message 3');
// Only one build fires, ~50ms after 'Message 3'
```

The debounce timer resets on each mutation. This prevents unnecessary builds during rapid user input, batch content loading, or RAG result streaming.

## Concurrency serialization

Builds are serialized — only one `Context.build()` runs at a time. If a build is in progress when the debounce fires, the new build waits for the current one to finish before starting.

Under the hood, `ReactiveContext` uses a Promise chain (`#chain`) and a monotonic generation counter (`#buildGeneration`):

1. Each build attempt increments the generation counter.
2. The build runs via `#runExclusive`, which chains onto the previous build's completion.
3. When a build finishes, it checks if its generation is still current. If a newer build was requested while it ran, the stale result is discarded.

This prevents race conditions where an older build's results overwrite a newer build's `meta`.

## Explicit builds

You can trigger a build manually instead of waiting for the debounce:

```typescript
const result = await ctx.build();
console.log(result.snapshot.meta.utilization);
```

Calling `build()` cancels any pending debounce timer, increments the generation counter, and runs the build immediately. The `meta`, `utilization`, and `buildError` refs are updated when it completes.

## Streaming build

`buildStream()` also works with reactive context:

```typescript
const stream = ctx.buildStream();
stream.on('slot:ready', (event) => {
  console.log(`${event.slot} ready`);
});
await stream.finished;
// ctx.meta.value is now updated
```

Like `build()`, `buildStream()` cancels the debounce and increments the generation. The `meta` ref updates only when `stream.finished` resolves and the generation still matches.

## Error handling

### `onBuildError` callback

Handle auto-rebuild failures without subscribing to `buildError`:

```typescript
const ctx = reactiveContext({
  model: 'gpt-4o',
  preset: 'chat',
  onBuildError(error) {
    console.error('Auto-rebuild failed:', error);
    reportToSentry(error);
  },
});
```

`onBuildError` fires for debounced builds only — not for explicit `build()` calls, which reject their returned promise.

### `buildError` ref

The `buildError` ref lets you reactively display errors in the UI:

```typescript
ctx.buildError.subscribe(() => {
  if (ctx.buildError.value) {
    showToast(`Build error: ${ctx.buildError.value.message}`);
  }
});
```

`buildError` is cleared (`undefined`) whenever a subsequent build succeeds.

## Reactive vs imperative

| Feature | `Context` (imperative) | `ReactiveContext` |
| --- | --- | --- |
| Build trigger | Manual `ctx.build()` | Automatic on mutation + manual `ctx.build()` |
| Result access | Return value of `build()` | `.meta`, `.utilization`, `.buildError` refs |
| State updates | Pull (call `build()`, read result) | Push (subscribe to refs) |
| Concurrency | Caller's responsibility | Serialized automatically |
| Use case | Scripts, CLI tools, server-side | Real-time UIs, dashboards |

Use imperative `Context` when you control exactly when builds happen. Use `ReactiveContext` when the UI should reflect context state continuously.

## Subscribing to signals

Refs follow a minimal signal pattern compatible with many frameworks:

```typescript
interface Ref<T> {
  value: T;
  subscribe(callback: () => void): () => void;
}

interface ReadonlyRef<T> {
  readonly value: T;
  subscribe(callback: () => void): () => void;
}
```

The `subscribe` callback receives no arguments — read `.value` inside the callback to get the current state. This design matches Vue 3's `ref()` (slotmux refs even set `__v_isRef = true` for native Vue compatibility) and works with React's `useSyncExternalStore`.

## Creating standalone refs

The `ref()` and `computedRef()` primitives are available for custom reactive state:

```typescript
import { ref, computedRef } from 'slotmux/reactive';

const count = ref(0);
const doubled = computedRef([count], () => count.value * 2);

count.value = 5;
console.log(doubled.value); // 10
```

## Cleanup

Call `dispose()` when you're done with a reactive context:

```typescript
ctx.dispose();
```

This clears any pending debounce timer, increments the generation counter (preventing stale builds from updating refs), and releases internal resources. After disposal, mutations still work on the underlying `Context` but no auto-rebuilds fire.

## Practical pattern: real-time utilization bar

```typescript
import { reactiveContext } from 'slotmux/reactive';

const ctx = reactiveContext({
  model: 'gpt-4o',
  preset: 'chat',
  debounceMs: 100,
});

ctx.system('You are a helpful assistant.');

// Update the UI whenever utilization changes
ctx.utilization.subscribe(() => {
  const pct = Math.round(ctx.utilization.value * 100);
  progressBar.style.width = `${pct}%`;
  progressBar.textContent = `${pct}%`;
  progressBar.className = pct > 85 ? 'bar danger' : pct > 60 ? 'bar warning' : 'bar';
});

// Each user message triggers a debounced rebuild → utilization updates
function onUserMessage(text: string) {
  ctx.user(text);
}
```

## Next

- [Streaming build](./streaming-build) — progressive slot delivery.
- [React](/guides/react) — React hooks for reactive context.
- [Vue](/guides/vue) — native Vue compatibility.
- [Angular](/guides/angular) — Angular Signals integration.
