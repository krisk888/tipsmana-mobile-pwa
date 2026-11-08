import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.js'

export default defineConfig(
  mergeConfig(viteConfig, {
    test: {
      include: ['tests/unit/**/*.test.mjs'],
      environment: 'happy-dom',
      setupFiles: ['tests/unit/setup-i18n.mjs'],
    },
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  })
)