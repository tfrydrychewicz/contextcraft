# Lossless compression and locales

The `@slotmux/compression` package includes a **lossless** text compression engine that reduces token usage without losing meaning. It removes filler phrases, collapses whitespace, applies abbreviations, strips standalone pleasantries, and deduplicates near-identical consecutive messages — all with locale-aware rules.

Typical savings: **10–30%** of tokens in conversational content.

## How it works

The lossless engine applies five transforms in order:

1. **Filler removal** — strips discourse markers like "well,", "you know,", "actually,", "basically," that add no semantic value.
2. **Abbreviation** — replaces verbose phrases with standard abbreviations: "for example" → "e.g.", "that is" → "i.e."
3. **Whitespace collapse** — normalizes runs of spaces, tabs, and blank lines into single spaces or newlines.
4. **Pleasantry stripping** — removes standalone "thanks", "you're welcome", "no problem" lines, and strips trailing thanks / leading welcome in user→assistant pairs.
5. **Fuzzy consecutive deduplication** — detects near-identical consecutive messages from the same role and keeps only the first. Uses Jaccard similarity on word sets with a Levenshtein fallback for short strings.

All transforms preserve the original meaning. No summarization, no paraphrasing — just noise removal.

## Using lossless compression

Set the overflow strategy to `'compress'` on a slot:

```typescript
import { createContext, Context, SlotOverflow } from 'slotmux';

const { config } = createContext({
  model: 'gpt-5.4',
  slots: {
    system: {
      priority: 100,
      budget: { fixed: 2000 },
      overflow: SlotOverflow.ERROR,
      defaultRole: 'system',
      position: 'before',
    },
    history: {
      priority: 50,
      budget: { flex: true },
      overflow: SlotOverflow.COMPRESS,
      defaultRole: 'user',
      position: 'after',
    },
  },
});
```

When the `history` slot exceeds its budget, the lossless engine compresses content before any truncation happens.

## Locale system

Filler phrases, abbreviations, and pleasantries are language-specific. The engine uses **language packs** — collections of regex patterns for a specific language.

### Built-in packs

| Tag | Language | Features |
| --- | --- | --- |
| `en` | English (default) | 7 filler patterns, 3 abbreviations, chat pleasantries |
| `de` | German | 5 filler patterns ("naja", "also", "eigentlich"...), 2 abbreviations ("z. B.", "d. h."), Danke/Bitte pairs |
| `minimal` | Any / unknown | No fillers, no abbreviations, no pleasantries — whitespace collapse + Unicode dedupe only |

### The `LosslessLanguagePack` interface

```typescript
type LosslessLanguagePack = {
  fillerPatterns: readonly RegExp[];
  abbreviations: ReadonlyArray<{ pattern: RegExp; replacement: string }>;
  pleasantryOnlyLine: RegExp;
  trailingThanks: RegExp;
  leadingWelcome: RegExp;
  dedupeLocale?: string;  // BCP 47 tag for toLocaleLowerCase in dedupe
};
```

| Field | Purpose |
| --- | --- |
| `fillerPatterns` | Regexes that match filler phrases to remove |
| `abbreviations` | Pattern → replacement pairs |
| `pleasantryOnlyLine` | Matches a full line that's only a short pleasantry |
| `trailingThanks` | Matches trailing "thanks" at the end of user messages |
| `leadingWelcome` | Matches leading "you're welcome" at the start of assistant messages |
| `dedupeLocale` | BCP 47 locale for `String.toLocaleLowerCase` during fuzzy dedupe |

## Specifying a locale

### Per slot

Set `overflowConfig.losslessLocale` on the slot:

```typescript
createContext({
  model: 'gpt-5.4',
  slots: {
    history: {
      priority: 50,
      budget: { flex: true },
      overflow: SlotOverflow.COMPRESS,
      overflowConfig: { losslessLocale: 'de' },
      defaultRole: 'user',
      position: 'after',
    },
  },
});
```

### Per content item

Set `losslessLocale` on individual items for mixed-language conversations:

```typescript
ctx.push('history', [
  { content: 'Hallo, wie geht es Ihnen?', role: 'user', losslessLocale: 'de' },
  { content: 'Hi, I am doing well!', role: 'assistant', losslessLocale: 'en' },
]);
```

Per-item locales override the slot-level setting. Items without a locale use the slot's `losslessLocale`, which defaults to `'en'`.

### The `minimal` pack

Use `'minimal'` for code-mixed conversations or when you don't know the language:

```typescript
overflowConfig: { losslessLocale: 'minimal' }
```

This disables all language-specific transforms and only applies whitespace collapse and Unicode-aware deduplication. Safe for any language.

## Registering a custom language pack

Add support for any language with `registerLosslessLanguagePack`:

```typescript
import { registerLosslessLanguagePack } from '@slotmux/compression';

registerLosslessLanguagePack('fr', {
  dedupeLocale: 'fr',
  fillerPatterns: [
    /\ben fait,?\s+/giu,
    /\bdu coup,?\s+/giu,
    /\bvoilà,?\s+/giu,
    /\bbon,?\s+/giu,
    /\bgenre,?\s+/giu,
  ],
  abbreviations: [
    { pattern: /\bpar exemple\b/giu, replacement: 'p. ex.' },
    { pattern: /\bc'est-à-dire\b/giu, replacement: 'c.-à-d.' },
  ],
  pleasantryOnlyLine:
    /^(?:merci|merci beaucoup|de rien|je vous en prie|pas de quoi|avec plaisir)[\s!.]*$/iu,
  trailingThanks: /\n*(?:merci|merci beaucoup)[!.]*\s*$/iu,
  leadingWelcome: /^(?:de rien|je vous en prie|pas de quoi|avec plaisir)[!.]*\s*/iu,
});
```

After registering, use `'fr'` as the `losslessLocale` in slot configs or per-item overrides.

### Locale resolution

The engine resolves locale tags in this order:

1. **Exact match** — `'de-AT'` → look up `'de-at'` in the registry.
2. **Base language** — `'de-AT'` → fall back to `'de'`.
3. **English** — if no match, fall back to `'en'`.

Register subtag-specific packs (e.g. `'pt-BR'`) when Brazilian Portuguese fillers differ from European Portuguese.

## Fuzzy deduplication

The engine detects near-identical **consecutive** messages from the same role and keeps only the first. This handles:

- Users who re-send the same question with minor edits.
- Assistant responses that repeat with slight formatting differences.

Similarity is computed using:

1. **NFKC normalization** — `'café'` normalizes the same regardless of composed vs decomposed form.
2. **Locale-aware lowercasing** — respects `dedupeLocale` for characters like German `ß`.
3. **Word tokenization** — split on whitespace and punctuation.
4. **Jaccard similarity** — intersection / union of word sets.
5. **Levenshtein fallback** — for very short strings (< 5 words), character-level edit distance is used instead.

The default threshold is 0.85 (85% similarity). Messages below this threshold are kept as distinct.

## English pack in detail

The built-in English pack removes these fillers:

| Pattern | Example |
| --- | --- |
| `well,` | "Well, I think..." → "I think..." |
| `so basically,` | "So basically, the issue..." → "The issue..." |
| `you know,` | "You know, it's..." → "It's..." |
| `I mean,` | "I mean, we could..." → "We could..." |
| `actually,` | "Actually, that's wrong" → "That's wrong" |
| `just to be clear,` | "Just to be clear, this is..." → "This is..." |
| `like,` | "Like, why would..." → "Why would..." |

And applies these abbreviations:

| Phrase | Replacement |
| --- | --- |
| "for example" | "e.g." |
| "that is" | "i.e." |
| "in other words" | "i.e." |

Pleasantry stripping removes standalone lines like "Thanks!", "Thank you", "You're welcome", "No problem", "My pleasure", and strips trailing thanks from user messages when followed by an assistant welcome response.

## Compression ratio expectations

The actual ratio depends on your content:

| Content type | Typical savings |
| --- | --- |
| Casual chat (lots of filler) | 20–30% |
| Technical discussion | 10–15% |
| Code snippets | 5–10% (mostly whitespace) |
| Already-compressed text | < 5% |

Lossless compression is applied **before** other overflow strategies. If the content still exceeds the budget after compression, the configured overflow strategy (truncate, sliding-window, etc.) runs on the compressed result.

## Next

- [Compression concept](/concepts/compression) — all compression strategies.
- [Overflow concept](/concepts/overflow) — how overflow triggers compression.
- [Custom plugin](./custom-plugin) — register a custom compressor via `registerCompressor`.
