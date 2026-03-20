# Multimodal content

Slotmux supports images alongside text in context messages. You can add image URLs or base64-encoded images to any slot, and the build pipeline handles token estimation, compilation, and provider-specific formatting automatically.

## Adding images

Content items can hold a string or an array of multimodal blocks:

```typescript
ctx.push('history', [{
  role: 'user',
  content: [
    { type: 'text', text: 'What is in this image?' },
    { type: 'image_url', imageUrl: 'https://example.com/photo.jpg' },
  ],
}]);
```

### Image URL

Reference an image hosted at a URL:

```typescript
{
  type: 'image_url',
  imageUrl: 'https://example.com/photo.jpg',
  mimeType: 'image/jpeg',       // optional
  tokenEstimate: 1024,          // optional — override default estimate
}
```

### Base64 image

Embed an image directly as base64:

```typescript
{
  type: 'image_base64',
  imageBase64: '/9j/4AAQSkZJRg...',  // base64 data
  mimeType: 'image/jpeg',
}
```

### Mixing text and images

A single message can contain multiple blocks of different types:

```typescript
ctx.push('history', [{
  role: 'user',
  content: [
    { type: 'text', text: 'Compare these two images:' },
    { type: 'image_url', imageUrl: 'https://example.com/before.jpg' },
    { type: 'image_url', imageUrl: 'https://example.com/after.jpg' },
    { type: 'text', text: 'What changed?' },
  ],
}]);
```

## Multimodal content types

```typescript
type MultimodalContent =
  | MultimodalContentText
  | MultimodalContentImageUrl
  | MultimodalContentImageBase64;
```

| Type | Required fields | Optional fields |
| --- | --- | --- |
| `text` | `text: string` | — |
| `image_url` | `imageUrl: string` | `mimeType`, `tokenEstimate` |
| `image_base64` | `imageBase64: string` | `mimeType`, `tokenEstimate` |

Both `image_url` and `image_base64` also accept snake_case variants (`image_url`, `image_base64`) for convenience when working with API responses directly.

## Token estimation for images

Images consume tokens differently than text. Each provider has its own formula based on image dimensions and detail level:

- **OpenAI** — 85 tokens for `low` detail; up to ~1,105 tokens for `high` detail (based on tile count).
- **Anthropic** — calculated from image dimensions.
- **Google** — flat token cost per image.

Slotmux uses a **heuristic fallback** when exact costs aren't available: non-text blocks contribute a small fixed estimate (64 characters ÷ 4 ≈ 16 tokens). For more accurate budgeting, set `tokenEstimate` on each image block:

```typescript
{
  type: 'image_url',
  imageUrl: 'https://example.com/photo.jpg',
  tokenEstimate: 1105,  // high-detail image on OpenAI
}
```

This value is used by the budget allocator and overflow engine when deciding whether the slot is within budget.

## Build pipeline

Multimodal content flows through the same pipeline as text:

1. **Push** — stored as `ContentItem` with `content: MultimodalContent[]`.
2. **Budget resolution** — token estimate includes text length + image estimates.
3. **Overflow** — if the slot exceeds budget, overflow strategies process multimodal items like any other content item. Text-only transforms (compression, truncation) apply to text blocks within the item.
4. **Compilation** — each block is converted to the provider-agnostic `CompiledContentPart` format.
5. **Formatting** — provider adapters convert to the wire format.

## Provider formatting differences

Each provider has its own wire format for multimodal content. Slotmux's provider adapters handle the conversion automatically.

### OpenAI

```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "What is in this image?" },
    { "type": "image_url", "image_url": { "url": "https://example.com/photo.jpg" } }
  ]
}
```

For base64, the URL becomes a data URI: `data:image/jpeg;base64,...`.

### Anthropic

```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "What is in this image?" },
    {
      "type": "image",
      "source": {
        "type": "url",
        "url": "https://example.com/photo.jpg"
      }
    }
  ]
}
```

For base64, Anthropic uses `"type": "base64"` with `data` and `media_type` fields.

### Google (Gemini)

```json
{
  "parts": [
    { "text": "What is in this image?" },
    {
      "inlineData": {
        "data": "base64data...",
        "mimeType": "image/jpeg"
      }
    }
  ]
}
```

Google also supports `fileData` with `fileUri` for hosted files.

### Ollama

Ollama uses a simplified format with a separate `images` array for base64 data.

### Mistral

Mistral follows the OpenAI-compatible `image_url` format.

## Plain text formatting

When you format a snapshot as plain text (for debugging or logging), images are represented as `[image]`:

```typescript
const text = snapshot.format('text');
// → "user: What is in this image? [image]\n..."
```

## Practical patterns

### Vision chatbot

```typescript
import { createContext, Context } from 'slotmux';

const { config } = createContext({
  model: 'gpt-5.4',
  preset: 'chat',
});
const ctx = Context.fromParsedConfig(config);

ctx.system('You are a helpful vision assistant. Describe images in detail.');

ctx.push('history', [{
  role: 'user',
  content: [
    { type: 'text', text: 'What breed is this dog?' },
    { type: 'image_url', imageUrl: userUploadedUrl, tokenEstimate: 1105 },
  ],
}]);

const { snapshot } = await ctx.build();
```

### Screenshots in agent loops

```typescript
ctx.push('scratchpad', [{
  role: 'user',
  content: [
    { type: 'text', text: 'Current browser state:' },
    {
      type: 'image_base64',
      imageBase64: screenshotBase64,
      mimeType: 'image/png',
      tokenEstimate: 765,
    },
  ],
}]);
```

### Managing image token budgets

Images can consume significant tokens. Use `tokenEstimate` to give the budget allocator accurate numbers, and consider putting image-heavy content in its own slot with a dedicated budget:

```typescript
createContext({
  model: 'gpt-5.4',
  slots: {
    system: { priority: 100, budget: { fixed: 1000 }, defaultRole: 'system', position: 'before' },
    images: { priority: 80, budget: { percent: 30 }, defaultRole: 'user', position: 'before', overflow: 'truncate' },
    history: { priority: 50, budget: { flex: true }, defaultRole: 'user', position: 'after', overflow: 'summarize' },
  },
});
```

## Next

- [Providers concept](/concepts/providers) — how each provider formats multimodal content.
- [Token counting concept](/concepts/token-counting) — token estimation methods.
- [Budgets concept](/concepts/budgets) — managing token budgets with image-heavy content.
