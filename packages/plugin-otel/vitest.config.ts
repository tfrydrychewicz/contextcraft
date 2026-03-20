import { defineConfig } from 'vitest/config';

import baseConfig from '../../vitest.config.base';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: [
      'src/**/*.test.ts',
      'src/**/*.integration.test.ts',
      '__tests__/**/*.test.ts',
    ],
  },
});
