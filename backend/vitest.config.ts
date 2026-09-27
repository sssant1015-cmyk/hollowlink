import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
  server: {
    deps: {
      // Ensure modern Node builtins (node:sqlite) are externalized, not bundled.
      external: [/^node:/],
    },
  },
});
