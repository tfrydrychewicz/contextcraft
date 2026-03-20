'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';

type Message = { role: 'user' | 'assistant'; content: string };
type Meta = { totalTokens: number; utilization: number };

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: 'user', content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [...messages, userMsg] }),
    });

    const data = (await res.json()) as {
      reply: string;
      meta: Meta;
    };

    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: data.reply },
    ]);
    setMeta(data.meta);
    setLoading(false);
  }

  return (
    <main
      style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '2rem',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
      }}
    >
      <h1 style={{ marginBottom: '0.5rem' }}>Slotmux Chat</h1>
      {meta && (
        <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Context: {meta.totalTokens} tokens ({(meta.utilization * 100).toFixed(1)}%
          utilization)
        </p>
      )}

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          border: '1px solid #ddd',
          borderRadius: 8,
          padding: '1rem',
          marginBottom: '1rem',
        }}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              marginBottom: '0.75rem',
              textAlign: m.role === 'user' ? 'right' : 'left',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                padding: '0.5rem 0.75rem',
                borderRadius: 12,
                background: m.role === 'user' ? '#0070f3' : '#f0f0f0',
                color: m.role === 'user' ? '#fff' : '#000',
                maxWidth: '80%',
              }}
            >
              {m.content}
            </span>
          </div>
        ))}
        {loading && (
          <div style={{ color: '#999' }}>Thinking...</div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          style={{
            flex: 1,
            padding: '0.75rem',
            borderRadius: 8,
            border: '1px solid #ddd',
            fontSize: '1rem',
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: 8,
            border: 'none',
            background: '#0070f3',
            color: '#fff',
            fontSize: '1rem',
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          Send
        </button>
      </form>
    </main>
  );
}
