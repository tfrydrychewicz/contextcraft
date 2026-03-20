/**
 * @contextcraft/compression — compression strategies (see `contextcraft-design.md` package layout).
 *
 * @packageDocumentation
 */

export const VERSION = '0.0.1';

export {
  LOSSLESS_LANGUAGE_PACK_DE,
  LOSSLESS_LANGUAGE_PACK_EN,
  LOSSLESS_LANGUAGE_PACK_MINIMAL,
  LosslessCompressor,
  getPlainTextForLossless,
  registerLosslessLanguagePack,
  resolveLosslessLanguagePack,
  unregisterLosslessLanguagePack,
} from './lossless-compressor.js';
export type {
  LosslessCompressibleItem,
  LosslessCompressorOptions,
  LosslessDetectLanguageFn,
  LosslessLanguagePack,
  LosslessMultimodalBlock,
  LosslessMultimodalImageBase64,
  LosslessMultimodalImageUrl,
  LosslessMultimodalText,
} from './lossless-compressor.js';
