import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/minisearch')) return 'vendor-minisearch';
          if (id.includes('src/data/tecnica_profunda.generated.json')) return 'data-tecnica';
          if (id.includes('src/data/protocols.generated.json')) return 'data-protocols';
          if (id.includes('src/data/formacao_teorica_data')) return 'data-teoria';
          return undefined;
        }
      }
    }
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      includeAssets: ['icon.svg'],
      manifest: {
        id: './',
        name: 'Cockpit Clínico — PEP & Habilidades',
        short_name: 'Cockpit PEP',
        lang: 'pt-BR',
        description: 'Protocolos clínicos copiáveis para prontuário eletrônico (PEP) e cartões Pré-Porta offline.',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        scope: './',
        start_url: './',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png,json,webmanifest}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              cacheableResponse: {
                statuses: [0, 200]
              },
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365
              }
            }
          }
        ]
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: false,
    allowedHosts: true
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true
  }
});
