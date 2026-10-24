import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.js'

export default defineConfig(
  mergeConfig(viteConfig, {
    test: {
      include: ['tests/unit/**/*.test.mjs'],
      environment: 'happy-dom',
    },
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  })
)