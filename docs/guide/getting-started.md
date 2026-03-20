# Getting started

For a **fully working terminal chatbot** with context metadata, token budgets, and OpenAI integration, see **[Terminal chatbot tutorial](/guide/build-a-chatbot)**.

## Install

```bash
pnpm add ctxforge
```

Optional tokenizers (pick what your models need):

```bash
pnpm add gpt-tokenizer
```

## Minimal example

The snippet below is typechecked in CI (`pnpm test:docs`). Source: [`docs/snippets/quickstart.example.ts`](https://github.com/tfrydrychewicz/ctxforge/tree/main/docs/snippets/quickstart.example.ts).

<<< @/snippets/quickstart.example.ts

## Packages

| Package           | Role                                      |
| ----------------- | ----------------------------------------- |
| `ctxforge`    | Core context manager, slots, token budget |
| `@ctxforge/*` | Compression, providers, React, debug UI   |

See the [design document](https://github.com/tfrydrychewicz/ctxforge) in the repository for architecture notes (not shipped in this site).
