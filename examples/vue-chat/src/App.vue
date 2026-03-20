<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { useSlotmux } from './use-slotmux';

type Message = { role: 'user' | 'assistant'; content: string };

const { meta, utilization, totalTokens, user, assistant, build } = useSlotmux();
const messages = ref<Message[]>([]);
const input = ref('');
const chatEnd = ref<HTMLDivElement | null>(null);

async function send() {
  const text = input.value.trim();
  if (!text) return;

  messages.value.push({ role: 'user', content: text });
  input.value = '';

  user(text);
  await build();

  // Simulate assistant response (replace with real API call)
  const reply = `Echo: ${text}`;
  assistant(reply);
  await build();

  messages.value.push({ role: 'assistant', content: reply });

  await nextTick();
  chatEnd.value?.scrollIntoView({ behavior: 'smooth' });
}
</script>

<template>
  <div class="container">
    <h1>Slotmux Vue Chat</h1>

    <div v-if="meta" class="status">
      <span>Tokens: {{ totalTokens }}</span>
      <span>Utilization: {{ (utilization * 100).toFixed(1) }}%</span>
      <span>Build: {{ meta.buildTimeMs }}ms</span>
    </div>

    <div class="messages">
      <div
        v-for="(m, i) in messages"
        :key="i"
        :class="['message', m.role]"
      >
        <span class="bubble">{{ m.content }}</span>
      </div>
      <div ref="chatEnd" />
    </div>

    <form @submit.prevent="send" class="input-row">
      <input v-model="input" placeholder="Type a message..." />
      <button type="submit">Send</button>
    </form>
  </div>
</template>

<style scoped>
.container {
  max-width: 640px;
  margin: 0 auto;
  padding: 2rem;
  font-family: system-ui, sans-serif;
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.status {
  display: flex;
  gap: 1rem;
  padding: 0.5rem 1rem;
  background: #f5f5f5;
  border-radius: 8px;
  font-size: 0.85rem;
  color: #666;
}

.messages {
  flex: 1;
  overflow-y: auto;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1rem;
  margin: 1rem 0;
}

.message {
  margin-bottom: 0.75rem;
}

.message.user {
  text-align: right;
}

.bubble {
  display: inline-block;
  padding: 0.5rem 0.75rem;
  border-radius: 12px;
  max-width: 80%;
}

.message.user .bubble {
  background: #42b883;
  color: #fff;
}

.message.assistant .bubble {
  background: #f0f0f0;
  color: #000;
}

.input-row {
  display: flex;
  gap: 8px;
}

.input-row input {
  flex: 1;
  padding: 0.75rem;
  border-radius: 8px;
  border: 1px solid #ddd;
  font-size: 1rem;
}

.input-row button {
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  border: none;
  background: #42b883;
  color: #fff;
  font-size: 1rem;
  cursor: pointer;
}
</style>
