/**
 * Locale-specific phrase patterns for lossless text compression (design §8.3).
 *
 * @packageDocumentation
 */

/**
 * Regex-driven rules for a single natural language (or custom pack).
 * All regexes should use the `u` flag when matching non-ASCII letters (e.g. German ß).
 */
export type LosslessLanguagePack = {
  readonly fillerPatterns: readonly RegExp[];
  readonly abbreviations: ReadonlyArray<{ pattern: RegExp; replacement: string }>;
  /** Matches a full line that is only a short pleasantry. */
  readonly pleasantryOnlyLine: RegExp;
  /** User message ends with a short thanks (for adjacent pair with assistant welcome). */
  readonly trailingThanks: RegExp;
  /** Assistant message starts with a short welcome / reply to thanks. */
  readonly leadingWelcome: RegExp;
  /**
   * BCP 47 locale for {@link String#toLocaleLowerCase} during fuzzy dedupe normalization.
   * Default applied in compressor when omitted: `'en'`.
   */
  readonly dedupeLocale?: string;
};

const registry: Record<string, LosslessLanguagePack> = Object.create(null) as Record<
  string,
  LosslessLanguagePack
>;

function normTag(tag: string): string {
  return tag.trim().toLowerCase();
}

function baseLanguage(tag: string): string {
  const t = normTag(tag);
  const i = t.indexOf('-');
  return i === -1 ? t : t.slice(0, i);
}

/** Regex that never matches (for packs with no phrase rules). */
const NEVER_MATCHES = /(?=a)b/u;

/**
 * **Minimal** pack — whitespace collapse + Unicode dedupe only; no filler, abbreviations, or pleasantry stripping.
 * Use for code-mixed or unknown-language threads, or set `locale: 'minimal'`.
 */
export const LOSSLESS_LANGUAGE_PACK_MINIMAL: LosslessLanguagePack = {
  dedupeLocale: 'en',
  fillerPatterns: [],
  abbreviations: [],
  pleasantryOnlyLine: NEVER_MATCHES,
  trailingThanks: NEVER_MATCHES,
  leadingWelcome: NEVER_MATCHES,
};

/** English (default) — filler, e.g./i.e., common chat pleasantries. */
export const LOSSLESS_LANGUAGE_PACK_EN: LosslessLanguagePack = {
  dedupeLocale: 'en',
  fillerPatterns: [
    /\bwell,?\s+/giu,
    /\bso basically,?\s+/giu,
    /\byou know,?\s+/giu,
    /\bi mean,?\s+/giu,
    /\bactually,?\s+/giu,
    /\bjust to be clear,?\s+/giu,
    /\blike,?\s+/giu,
  ],
  abbreviations: [
    { pattern: /\bfor example\b/giu, replacement: 'e.g.' },
    { pattern: /\bthat is\b/giu, replacement: 'i.e.' },
    { pattern: /\bin other words\b/giu, replacement: 'i.e.' },
  ],
  pleasantryOnlyLine:
    /^(?:thanks?|thank you|you'?re welcome|thanks so much|no problem|my pleasure|np|ty|thx)[\s!.]*$/iu,
  trailingThanks: /\n*(?:thanks?|thank you)[!.]*\s*$/iu,
  leadingWelcome: /^(?:you'?re welcome|no problem|my pleasure)[!.]*\s*/iu,
};

/**
 * German reference pack — discourse markers, z. B. / d. h., Danke / Bitte pairs.
 */
export const LOSSLESS_LANGUAGE_PACK_DE: LosslessLanguagePack = {
  dedupeLocale: 'de',
  fillerPatterns: [
    /\bnaja,?\s+/giu,
    /\balso,?\s+/giu,
    /\beigentlich,?\s+/giu,
    /\bquasi,?\s+/giu,
    /\bsozusagen,?\s+/giu,
  ],
  abbreviations: [
    { pattern: /\bzum\s+Beispiel\b/giu, replacement: 'z. B.' },
    { pattern: /\bdas\s+hei(ss|ß)t\b/giu, replacement: 'd. h.' },
    { pattern: /\bmit\s+anderen\s+Worten\b/giu, replacement: 'd. h.' },
  ],
  pleasantryOnlyLine:
    /^(?:danke|danke\s+schön|danke\s+dir|danke\s+Ihnen|vielen\s+dank|bitte|gern\s+geschehen|keine\s+ursache|tschüss|tschüs)[\s!.]*$/iu,
  trailingThanks:
    /\n*(?:danke|danke\s+schön|danke\s+dir|danke\s+Ihnen|vielen\s+dank)[!.]*\s*$/iu,
  leadingWelcome: /^(?:bitte|gern\s+geschehen|keine\s+ursache)[!.]*\s*/iu,
};

function seedBuiltins(): void {
  registry['en'] = LOSSLESS_LANGUAGE_PACK_EN;
  registry['de'] = LOSSLESS_LANGUAGE_PACK_DE;
  registry['minimal'] = LOSSLESS_LANGUAGE_PACK_MINIMAL;
}

seedBuiltins();

/**
 * Register or replace a pack for a normalized BCP 47 tag (e.g. `fr`, `de-AT`).
 * Subtags (`de-AT`) are stored only under that key; resolution falls back to the base language (`de`) then `en`.
 */
export function registerLosslessLanguagePack(tag: string, pack: LosslessLanguagePack): void {
  registry[normTag(tag)] = pack;
}

/** Removes a tag from the registry (built-ins `en` / `de` should not be removed in production). */
export function unregisterLosslessLanguagePack(tag: string): void {
  delete registry[normTag(tag)];
}

/**
 * Resolves a built-in or registered pack. Unknown tags fall back to base language, then English.
 */
export function resolveLosslessLanguagePack(tag: string | undefined): LosslessLanguagePack {
  if (tag === undefined || tag === '') {
    return LOSSLESS_LANGUAGE_PACK_EN;
  }
  const t = normTag(tag);
  return registry[t] ?? registry[baseLanguage(t)] ?? LOSSLESS_LANGUAGE_PACK_EN;
}
