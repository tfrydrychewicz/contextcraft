# RAG with Pinecone

Retrieval-augmented generation using slotmux's RAG plugin with Pinecone as the vector store.

## Setup

```bash
npm install
export OPENAI_API_KEY=sk-...
export PINECONE_API_KEY=pc-...
export PINECONE_INDEX=your-index-name   # optional, defaults to "slotmux-demo"
```

Make sure your Pinecone index exists and has documents with a `text` metadata field.

## Run

```bash
npm start
```

## What it demonstrates

- `ragPlugin` with deduplication and chunk limits
- `createContext` with the `rag` preset (system + rag + history + output slots)
- Pinecone vector search → push results into the `rag` slot
- Per-slot token breakdown from `snapshot.meta.slots`
- Automatic deduplication of near-duplicate chunks
