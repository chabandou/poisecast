import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { cp, mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { createStreamProxyCoreFromEnv, sendJson } from './api/shared/streamProxyCore'
import { createNodeStreamPipeResponder, handleStreamProxyRequest } from './api/shared/streamProxyHandler'

const streamProxyCore = createStreamProxyCoreFromEnv(process.env)

async function handleLocalStreamProxy(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await handleStreamProxyRequest(streamProxyCore, req, {
    setHeader: (name, value) => res.setHeader(name, value),
    setStatusCode: (statusCode) => {
      res.statusCode = statusCode
    },
    sendJson: (statusCode, body) => sendJson(res, statusCode, body),
    end: () => res.end(),
    pipeFromWeb: createNodeStreamPipeResponder(res),
  })
}

function localStreamProxyPlugin(): Plugin {
  return {
    name: 'local-stream-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/stream', (req, res) => {
        void handleLocalStreamProxy(req, res)
      })
    },
  }
}

function runtimeAssetCopyPlugin(): Plugin {
  let projectRoot = process.cwd()
  let outputRoot = path.resolve(projectRoot, 'dist')

  return {
    name: 'runtime-asset-copy',
    apply: 'build',
    configResolved(config) {
      projectRoot = config.root
      outputRoot = path.resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      const runtimeDirs = ['models', 'ort']

      for (const dirName of runtimeDirs) {
        const sourceDir = path.resolve(projectRoot, dirName)
        const targetDir = path.resolve(outputRoot, dirName)
        try {
          await stat(sourceDir)
        } catch {
          continue
        }
        await mkdir(targetDir, { recursive: true })
        await cp(sourceDir, targetDir, { recursive: true, force: true })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  optimizeDeps: {
    include: ['onnxruntime-web'],
  },
  plugins: [
    react(),
    localStreamProxyPlugin(),
    runtimeAssetCopyPlugin(),
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
        // ORT and model binaries are downloaded on demand and cached opportunistically at runtime.
        globIgnores: ['**/*.wasm', '**/*.onnx'],

        // Workbox default is 2 MiB; our `.onnx` and `.wasm` exceed that by a lot.
        // This must be high enough for the largest ORT wasm (~25.5 MiB).
        maximumFileSizeToCacheInBytes: 40 * 1024 * 1024,

        additionalManifestEntries: [],

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
