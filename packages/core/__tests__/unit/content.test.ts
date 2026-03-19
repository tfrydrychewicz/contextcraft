import { describe, expect, it } from 'vitest';

import { createContentId, toTokenCount } from '../../src/types/branded.js';
import type {
  ContentItem,
  MessageRole,
  MultimodalContent,
  CompiledMessage,
  CompiledContentPart,
} from '../../src/types/content.js';

describe('MessageRole', () => {
  it('accepts all role values', () => {
    const roles: MessageRole[] = [
      'system',
      'user',
      'assistant',
      'tool',
      'function',
    ];
    expect(roles).toHaveLength(5);
  });
});

describe('MultimodalContent', () => {
  it('accepts text content', () => {
    const content: MultimodalContent = { type: 'text', text: 'Hello' };
    expect(content.type).toBe('text');
    expect(content.text).toBe('Hello');
  });

  it('accepts image_url content', () => {
    const content: MultimodalContent = {
      type: 'image_url',
      imageUrl: 'https://example.com/image.png',
      tokenEstimate: 256,
    };
    expect(content.type).toBe('image_url');
    expect(content.imageUrl).toBeDefined();
  });

  it('accepts image_base64 content', () => {
    const content: MultimodalContent = {
      type: 'image_base64',
      imageBase64: 'base64data',
      mimeType: 'image/png',
    };
    expect(content.type).toBe('image_base64');
    expect(content.imageBase64).toBeDefined();
  });
});

describe('ContentItem', () => {
  it('accepts minimal content item with string content', () => {
    const item: ContentItem = {
      id: createContentId(),
      role: 'user',
      content: 'Hello world',
      slot: 'history',
      createdAt: Date.now(),
    };
    expect(item.role).toBe('user');
    expect(item.content).toBe('Hello world');
    expect(item.slot).toBe('history');
  });

  it('accepts content item with multimodal content', () => {
    const item: ContentItem = {
      id: createContentId(),
      role: 'user',
      content: [
        { type: 'text', text: 'Look at this' },
        { type: 'image_url', imageUrl: 'https://example.com/img.png' },
      ],
      slot: 'history',
      createdAt: Date.now(),
    };
    expect(item.content).toHaveLength(2);
    expect(item.content[0]).toHaveProperty('type', 'text');
    expect(item.content[1]).toHaveProperty('type', 'image_url');
  });

  it('accepts full content item with all optional fields', () => {
    const item: ContentItem = {
      id: createContentId(),
      role: 'system',
      content: 'You are helpful.',
      slot: 'system',
      tokens: toTokenCount(5),
      metadata: { source: 'config' },
      pinned: true,
      ephemeral: false,
      createdAt: Date.now(),
      summarizes: [createContentId()],
    };
    expect(item.pinned).toBe(true);
    expect(item.tokens).toBe(5);
    expect(item.summarizes).toHaveLength(1);
  });
});

describe('CompiledMessage', () => {
  it('accepts simple text message', () => {
    const msg: CompiledMessage = {
      role: 'user',
      content: 'Hello',
    };
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('Hello');
  });

  it('accepts message with content parts', () => {
    const msg: CompiledMessage = {
      role: 'user',
      content: [
        { type: 'text', text: 'See this image' },
        {
          type: 'image_url',
          image_url: { url: 'https://example.com/img.png', detail: 'auto' },
        },
      ],
    };
    expect(msg.content).toHaveLength(2);
    const parts = msg.content as CompiledContentPart[];
    expect(parts[0]).toHaveProperty('type', 'text');
    expect(parts[1]).toHaveProperty('type', 'image_url');
  });

  it('accepts message with base64 image', () => {
    const msg: CompiledMessage = {
      role: 'user',
      content: [
        {
          type: 'image_base64',
          image_base64: { data: 'abc123', mime_type: 'image/png' },
        },
      ],
    };
    const parts = msg.content as CompiledContentPart[];
    expect(parts[0]).toHaveProperty('type', 'image_base64');
  });

  it('accepts message with optional name', () => {
    const msg: CompiledMessage = {
      role: 'user',
      content: 'Hi',
      name: 'alice',
    };
    expect(msg.name).toBe('alice');
  });
});
