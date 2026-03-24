import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    /* Test file pattern */
    include: ['tests/unit/**/*.test.ts'],

    /* Global test APIs (describe, it, expect) without imports */
    globals: true,

    /* Run in Node environment (use 'jsdom' or 'happy-dom' for browser-like env) */
    environment: 'node',

    /* Coverage configuration */
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },

    /* Reporter */
    reporters: ['verbose'],
  },

  resolve: {
    alias: {
      '@src': resolve(__dirname, 'src'),
      '@tests': resolve(__dirname, 'tests'),
    },
  },
});
