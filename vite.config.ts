import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function fileRevision(absPath: string): string {
  const h = createHash('sha256')
  h.update(readFileSync(absPath))
  return h.digest('hex').slice(0, 16)
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      devOptions: {
        enabled: true,
      },
      manifest: {
        name: 'Poisecast',
        short_name: 'Poisecast',
        description: 'Podcast player with optional client-side voice isolation.',
        theme_color: '#0b0f14',
        background_color: '#0b0f14',
        display: 'standalone',
        id: '/',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache only the default model + core ORT WASM needed for first-run offline use.
        // Other models remain on-demand and will be cached when selected/used.
        globIgnores: ['**/*.wasm', '**/*.onnx'],

        // Workbox default is 2 MiB; our `.onnx` and `.wasm` exceed that by a lot.
        // This must be high enough for the largest ORT wasm (~25.5 MiB).
        maximumFileSizeToCacheInBytes: 40 * 1024 * 1024,

        additionalManifestEntries: (() => {
          const here = path.dirname(fileURLToPath(import.meta.url))
          const pub = path.join(here, 'public')
          const files = [
            'models/denoiser_model.onnx',
            'ort/ort-wasm.wasm',
            'ort/ort-wasm-simd.wasm',
          ]

          return files.map((rel) => ({
            url: `/${rel.replace(/\\\\/g, '/')}`,
            revision: fileRevision(path.join(pub, rel)),
          }))
        })(),

        // Cache model files and RSS responses opportunistically.
        runtimeCaching: [
          {
            urlPattern: ({ request }) =>
              request.destination === 'audio' ||
              request.url.endsWith('.onnx') ||
              request.url.endsWith('.wasm') ||
              request.url.includes('/models/') ||
              request.url.includes('/ort/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'poisecast-assets',
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'document' || request.url.endsWith('.xml'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'poisecast-feeds',
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
})
