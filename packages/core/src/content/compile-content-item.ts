/**
 * Compile a {@link ContentItem} to a provider-agnostic {@link CompiledMessage} (§5.4).
 *
 * Shared by the orchestrator and token-fill paths so lazy counting can call
 * {@link Tokenizer.countMessage} without importing the full pipeline.
 *
 * @packageDocumentation
 */

import type {
  CompiledContentPart,
  CompiledMessage,
  ContentItem,
  MultimodalContent,
} from '../types/content.js';

/**
 * Maps a stored {@link ContentItem} to wire-style {@link CompiledMessage} shape.
 */
export function compileContentItem(item: ContentItem): CompiledMessage {
  if (typeof item.content === 'string') {
    const m: CompiledMessage = { role: item.role, content: item.content };
    if (item.name !== undefined) {
      m.name = item.name;
    }
    if (item.toolCallId !== undefined) {
      m.tool_call_id = item.toolCallId;
    }
    if (item.toolUses !== undefined) {
      m.toolUses = item.toolUses;
    }
    return m;
  }
  const parts: CompiledContentPart[] = [];
  for (const block of item.content as MultimodalContent[]) {
    if (block.type === 'text') {
      parts.push({ type: 'text', text: block.text });
    } else if (block.type === 'image_url') {
      const url = block.imageUrl ?? block.image_url ?? '';
      parts.push({
        type: 'image_url',
        image_url: { url },
      });
    } else {
      const data = block.imageBase64 ?? block.image_base64 ?? '';
      parts.push({
        type: 'image_base64',
        image_base64:
          block.mimeType !== undefined
            ? { data, mime_type: block.mimeType }
            : { data },
      });
    }
  }
  const m: CompiledMessage = { role: item.role, content: parts };
  if (item.name !== undefined) {
    m.name = item.name;
  }
  if (item.toolCallId !== undefined) {
    m.tool_call_id = item.toolCallId;
  }
  if (item.toolUses !== undefined) {
    m.toolUses = item.toolUses;
  }
  return m;
}
