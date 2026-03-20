import { createContext, Context } from 'slotmux';

const { config } = createContext({
  model: 'gpt-4o-mini',
  reserveForResponse: 4096,
  charTokenEstimateForMissing: true,
  slots: {
    system: { priority: 100, budget: { fixed: 500 }, overflow: 'error' },
    context: { priority: 80, budget: { percent: 30 }, overflow: 'truncate' },
    history: { priority: 50, budget: { flex: true }, overflow: 'sliding-window' },
  },
});

const ctx = Context.fromParsedConfig(config);

ctx.system('You are a helpful assistant.');

ctx.push('context', 'Background: Slotmux is a context window manager for LLM applications.');
ctx.push('context', 'Background: It uses slots with token budgets and overflow strategies.');
ctx.push('context', 'Background: Snapshots are immutable compiled results.');

for (let i = 1; i <= 20; i++) {
  ctx.user(`User message ${i}: This is turn ${i} of the conversation.`);
  ctx.assistant(`Assistant reply ${i}: Acknowledged turn ${i}.`);
}

console.log('Starting streaming build...\n');

const stream = ctx.buildStream();

stream.on('slot:ready', (event) => {
  if (event.type !== 'slot:ready') return;
  console.log(
    `  [slot:ready] ${event.slot} — ${event.messages.length} message(s)`,
  );
  for (const msg of event.messages) {
    const preview =
      typeof msg.content === 'string'
        ? msg.content.slice(0, 60)
        : '(multimodal)';
    console.log(`    ${msg.role}: ${preview}${preview.length >= 60 ? '...' : ''}`);
  }
});

stream.on('complete', (event) => {
  if (event.type !== 'complete') return;
  const { snapshot } = event.result;
  console.log('\n--- Build complete ---');
  console.log(`Total tokens: ${snapshot.meta.totalTokens}`);
  console.log(`Messages: ${snapshot.messages.length}`);
  console.log(`Utilization: ${(snapshot.meta.utilization * 100).toFixed(1)}%`);
  console.log(`Build time: ${snapshot.meta.buildTimeMs}ms`);
  console.log('\nPer-slot breakdown:');
  for (const [name, slot] of Object.entries(snapshot.meta.slots)) {
    console.log(
      `  ${name}: ${slot.usedTokens}/${slot.budgetTokens} tokens ` +
        `(${slot.itemCount} items, overflow: ${slot.overflowTriggered ? 'yes' : 'no'})`,
    );
  }
});

stream.on('error', (event) => {
  if (event.type !== 'error') return;
  console.error('Build error:', event.error);
});

await stream.finished;
console.log('\nDone.');
