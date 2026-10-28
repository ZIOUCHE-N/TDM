import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 45_000,
    hookTimeout: 30_000,
    pool: 'forks',
    fileParallelism: false
  }
})
