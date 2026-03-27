// Vitest config kept for IDE integration (test discovery).
// Tests are actually run via: tsx --test src/__tests__/**/*.test.ts
// See package.json "test" script.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
  },
})
