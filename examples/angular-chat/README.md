# Angular Chat

Angular integration with slotmux using Signals and an injectable service.

## Quick demo (no Angular CLI needed)

```bash
npm install
npm start
```

This runs a Node.js simulation of the Angular service pattern.

## Full Angular app

To use in a real Angular project:

```bash
ng new my-slotmux-app --standalone
cd my-slotmux-app
npm install slotmux @slotmux/providers
```

Then copy these files into `src/app/`:

- `src/slotmux.service.ts` — injectable service wrapping `ReactiveContext`
- `src/chat.component.ts` — standalone component with Signals-bound UI

Wire it up in your `app.component.ts`:

```typescript
import { Component } from '@angular/core';
import { ChatComponent } from './chat.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ChatComponent],
  template: '<app-chat />',
})
export class AppComponent {}
```

## What it demonstrates

- `SlotmuxService` as an injectable singleton wrapping `reactiveContext()`
- Angular `signal()` bound to `rctx.meta.subscribe()` / `rctx.utilization.subscribe()`
- `@for` control flow for message rendering
- `@if` for conditional status bar and error display
- Same user flow as React and Vue examples (add messages, rebuild, show stats)
