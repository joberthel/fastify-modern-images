import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['lcov', 'text'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 85,
        lines: 80,
      },
    },
  },
})
