import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Domain tests are pure and need no database or environment. Integration
    // tests that do will set their own env in a setup file.
    globals: false,
  },
});
