import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.js'],
    coverage: {
      include: ['src/**', 'functions/**'],
      exclude: ['src/audithole.js'], // orchestrator -- integration only
    },
  },
});
