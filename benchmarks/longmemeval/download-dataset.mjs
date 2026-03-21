#!/usr/bin/env node

/**
 * Downloads LongMemEval_S (cleaned) from HuggingFace into benchmarks/longmemeval/data/.
 * Skips download if the file already exists.
 */

import { existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const TARGET = join(DATA_DIR, 'longmemeval_s_cleaned.json');
const URL =
  'https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json';

if (existsSync(TARGET)) {
  console.log(`Dataset already exists at ${TARGET} — skipping download.`);
  process.exit(0);
}

mkdirSync(DATA_DIR, { recursive: true });

console.log(`Downloading LongMemEval_S from ${URL} ...`);
const res = await fetch(URL);
if (!res.ok) {
  console.error(`Download failed: HTTP ${res.status} ${res.statusText}`);
  process.exit(1);
}

const fileStream = createWriteStream(TARGET);
await pipeline(res.body, fileStream);

console.log(`Saved to ${TARGET}`);
