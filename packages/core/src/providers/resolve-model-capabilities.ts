/**
 * Map {@link MODEL_REGISTRY} entries and defaults to {@link ModelCapabilities}.
 *
 * @packageDocumentation
 */

import {
  inferProviderFromModelId,
  resolveModel,
  type ModelRegistryEntry,
} from '../config/model-registry.js';
import type { ModelId, ProviderId } from '../types/config.js';
import type { ModelCapabilities } from '../types/provider.js';

/** Default tokenizer hint when the registry has no row for a provider. */
export function defaultTokenizerNameForProvider(provider: ProviderId): string {
  switch (provider) {
    case 'anthropic':
      return 'anthropic-claude';
    case 'openai':
    case 'mistral':
    case 'ollama':
    case 'google':
    case 'custom':
    default:
      return 'cl100k_base';
  }
}

/** Heuristic max output tokens from context size (until pricing tables land in registry). */
export function defaultMaxOutputTokens(maxContextTokens: number): number {
  if (maxContextTokens >= 512_000) {
    return 65_536;
  }
  if (maxContextTokens >= 32_000) {
    return 16_384;
  }
  return Math.min(4096, Math.max(1024, maxContextTokens - 1));
}

/** Capabilities when the model id is unknown but matches this provider (or as last resort). */
export function defaultModelCapabilities(provider: ProviderId): ModelCapabilities {
  const maxContextTokens =
    provider === 'google'
      ? 1_048_576
      : provider === 'anthropic'
        ? 200_000
        : provider === 'openai'
          ? 128_000
          : provider === 'mistral'
            ? 128_000
            : 8192;

  return {
    maxContextTokens,
    maxOutputTokens: defaultMaxOutputTokens(maxContextTokens),
    supportsFunctions: true,
    supportsVision: true,
    supportsStreaming: true,
    tokenizerName: defaultTokenizerNameForProvider(provider),
  };
}

/** Convert a registry row to full {@link ModelCapabilities}. */
export function modelRegistryEntryToCapabilities(
  entry: ModelRegistryEntry,
): ModelCapabilities {
  const tokenizerName =
    entry.tokenizerName ?? defaultTokenizerNameForProvider(entry.provider);

  return {
    maxContextTokens: entry.maxTokens,
    maxOutputTokens: defaultMaxOutputTokens(entry.maxTokens),
    supportsFunctions: true,
    supportsVision: true,
    supportsStreaming: true,
    tokenizerName,
  };
}

/**
 * Resolve capabilities for a concrete provider adapter using {@link MODEL_REGISTRY}
 * and {@link inferProviderFromModelId}.
 */
export function resolveModelCapabilitiesForAdapter(
  adapterProvider: ProviderId,
  modelId: ModelId,
): ModelCapabilities {
  const row = resolveModel(modelId);
  if (row !== undefined && row.provider === adapterProvider) {
    return modelRegistryEntryToCapabilities(row);
  }
  if (inferProviderFromModelId(modelId) === adapterProvider) {
    return defaultModelCapabilities(adapterProvider);
  }
  return defaultModelCapabilities(adapterProvider);
}
