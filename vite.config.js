import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/mobile/',
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'favicon.ico', 'favicon.svg', 'images/*.jpg'],
      manifest: {
        name: "Tipsmana — L'App du Boss",
        short_name: 'Tipsmana',
        description: 'Gestion restaurant mobile — inventaire, caisse, pilotage, cuisine, stock',
        theme_color: '#059669',
        background_color: '#06241b',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'fr',
        scope: '/mobile/',
        start_url: '/mobile/',
        categories: ['business', 'food', 'productivity'],
        icons: [
          { src: 'icons/icon-96.png', sizes: '96x96', type: 'image/png' },
          { src: 'icons/icon-144.png', sizes: '144x144', type: 'image/png' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Handlers push / notificationclick (public/push-sw.js, copié tel quel dans dist/)
        importScripts: ['push-sw.js'],
        // Données statiques (build hashé) : précache = cache-first
        globPatterns: ['**/*.{js,css,html,png,jpg,svg,ico,json,woff2}'],
        cleanupOutdatedCaches: true,
        // SPA hors-ligne : les navigations retombent sur index.html, sauf l'API
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/\/api\//, /\/ws\//],
        runtimeCaching: [
          {
            // Auth : jamais de cache (jetons, profil de session)
            urlPattern: /\/api\/v1\/auth\//,
            handler: 'NetworkOnly',
          },
          {
            // Données dynamiques : network-first avec repli cache
            urlPattern: /\/api\/v1\//,
            handler: 'NetworkFirst',
            method: 'GET',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24, // repli hors-ligne 24h
              },
              cacheableResponse: { statuses: [200] },
              plugins: [
                {
                  // Même URL, établissements différents (header X-Establishment-ID) :
                  // la clé de cache inclut l'établissement pour ne jamais servir
                  // les données d'un établissement à un autre
                  cacheKeyWillBeUsed: async ({ request }) => {
                    const est = request.headers.get('X-Establishment-ID') || 'default'
                    const url = new URL(request.url)
                    url.searchParams.set('__est', est)
                    return url.href
                  },
                },
              ],
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          {
            // Fichiers de police : immuables → cache-first
            urlPattern: /^https:\/\/fonts\.gstatic\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5199,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})