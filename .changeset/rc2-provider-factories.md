---
"slotmux": minor
"@slotmux/providers": minor
---

Add provider factories (`openai()`, `anthropic()`, `google()`, `mistral()`, `ollama()`) that auto-wire LLM summarization and embedding capabilities via the new `slotmuxProvider` config field. Beginners pass just an API key; advanced users can override the compression model or supply custom functions.
