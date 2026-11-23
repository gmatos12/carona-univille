import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    passWithNoTests: true,
    testTimeout: 30000,
    hookTimeout: 60000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.js'],
      all: true,
    },
  },
})
