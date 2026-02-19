import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/lib.ts'),
      name: 'Globe',
      fileName: (format) => `globe.${format}.js`,
      formats: ['es'],
    },
    rollupOptions: {
      external: ['three'],
    },
  },
})
