import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [preact()],
  root: __dirname,
  base: '/inspector/',
  build: {
    outDir: resolve(__dirname, '../inspector-static'),
    emptyOutDir: true,
    sourcemap: true,
  },
});
