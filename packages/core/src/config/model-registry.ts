/**
 * Built-in model → provider / context window / tokenizer hints (§10.2 — Phase 5.3 subset).
 *
 * @packageDocumentation
 */

import type { ModelId, ProviderId } from '../types/config.js';

/** Metadata inferred from a known model id. */
export type ModelRegistryEntry = {
  /** Context window size (input + output upper bound used for maxTokens default). */
  readonly maxTokens: number;
  readonly provider: ProviderId;
  /** Optional {@link TokenizerConfig.name} suggestion. */
  readonly tokenizerName?: string;
};

function freezeEntries(
  o: Record<string, ModelRegistryEntry>,
): Record<string, ModelRegistryEntry> {
  return Object.freeze({ ...o });
}

/**
 * Built-in registry (exact id match after {@link normalizeModelId}).
 * Use {@link registerModel} for app-specific entries.
 */
export const MODEL_REGISTRY: Readonly<Record<string, ModelRegistryEntry>> =
  freezeEntries({
    'gpt-4o': {
      maxTokens: 128_000,
      provider: 'openai',
      tokenizerName: 'o200k_base',
    },
    'gpt-4o-mini': {
      maxTokens: 128_000,
      provider: 'openai',
      tokenizerName: 'o200k_base',
    },
    'gpt-4-turbo': {
      maxTokens: 128_000,
      provider: 'openai',
      tokenizerName: 'cl100k_base',
    },
    'gpt-4': {
      maxTokens: 8192,
      provider: 'openai',
      tokenizerName: 'cl100k_base',
    },
    o1: {
      maxTokens: 200_000,
      provider: 'openai',
      tokenizerName: 'o200k_base',
    },
    'o1-mini': {
      maxTokens: 128_000,
      provider: 'openai',
      tokenizerName: 'o200k_base',
    },
    o3: {
      maxTokens: 200_000,
      provider: 'openai',
      tokenizerName: 'o200k_base',
    },
    'claude-sonnet-4-20250514': {
      maxTokens: 200_000,
      provider: 'anthropic',
    },
    'claude-opus-4-20250514': {
      maxTokens: 200_000,
      provider: 'anthropic',
    },
    'claude-3-5-haiku-20241022': {
      maxTokens: 200_000,
      provider: 'anthropic',
    },
    'gemini-2.0-flash': {
      maxTokens: 1_000_000,
      provider: 'google',
    },
    'gemini-2.0-pro': {
      maxTokens: 2_000_000,
      provider: 'google',
    },
    'mistral-large-latest': {
      maxTokens: 128_000,
      provider: 'mistral',
    },
    'ollama/llama3': {
      maxTokens: 8192,
      provider: 'ollama',
    },
  });

const customRegistry = new Map<string, ModelRegistryEntry>();

/** Normalize model ids for registry lookup. */
export function normalizeModelId(modelId: ModelId): string {
  return modelId.trim().toLowerCase();
}

/**
 * Register or override a model entry (e.g. custom deployments).
 */
export function registerModel(modelId: ModelId, entry: ModelRegistryEntry): void {
  customRegistry.set(normalizeModelId(modelId), { ...entry });
}

/**
 * Clears {@link registerModel} entries (for tests).
 */
export function clearRegisteredModels(): void {
  customRegistry.clear();
}

function prefixMatch(id: string): ModelRegistryEntry | undefined {
  if (id.startsWith('gpt-4o')) {
    return MODEL_REGISTRY['gpt-4o'];
  }
  if (id.startsWith('gpt-4-turbo')) {
    return MODEL_REGISTRY['gpt-4-turbo'];
  }
  if (id.startsWith('o1') || id.startsWith('o3')) {
    return MODEL_REGISTRY['o1'];
  }
  if (id.startsWith('claude')) {
    return MODEL_REGISTRY['claude-3-5-haiku-20241022'];
  }
  if (id.startsWith('gemini')) {
    return MODEL_REGISTRY['gemini-2.0-flash'];
  }
  if (id.includes('mistral') || id.includes('mixtral')) {
    return MODEL_REGISTRY['mistral-large-latest'];
  }
  if (id.startsWith('ollama/')) {
    return MODEL_REGISTRY['ollama/llama3'];
  }
  return undefined;
}

/**
 * Resolve registry metadata: custom → exact built-in → prefix families.
 */
export function resolveModel(modelId: ModelId): ModelRegistryEntry | undefined {
  const id = normalizeModelId(modelId);
  const custom = customRegistry.get(id);
  if (custom !== undefined) {
    return custom;
  }
  const exact = MODEL_REGISTRY[id];
  if (exact !== undefined) {
    return exact;
  }
  return prefixMatch(id);
}

/**
 * Best-effort provider detection when no registry row exists.
 */
export function inferProviderFromModelId(modelId: ModelId): ProviderId | undefined {
  const m = modelId.trim().toLowerCase();
  if (m.includes('gpt') || m.startsWith('o1') || m.startsWith('o3')) {
    return 'openai';
  }
  if (m.includes('claude')) {
    return 'anthropic';
  }
  if (m.includes('gemini')) {
    return 'google';
  }
  if (m.includes('mistral') || m.includes('mixtral')) {
    return 'mistral';
  }
  if (m.includes('ollama')) {
    return 'ollama';
  }
  return undefined;
}
