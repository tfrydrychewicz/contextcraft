/**
 * Standalone config for `pnpm bench:latency-report` — not part of the default workspace test glob.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.base';

const coreRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: coreRoot,
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['__tests__/benchmarks/context-build-latency.report.test.ts'],
  },
});
