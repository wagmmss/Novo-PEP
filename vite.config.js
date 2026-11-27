import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

function readBuildMetadata() {
  let version = '1.0.0';
  try {
    const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
    if (pkg?.version) version = String(pkg.version);
  } catch {
    // Fallback padrão se package.json não puder ser lido
  }
  let gitSha = 'local';
  try {
    gitSha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim() || 'local';
  } catch {
    // Build fora de worktree git
  }
  const buildTime = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return { version, gitSha, buildTime };
}

const BUILD_META = readBuildMetadata();

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(BUILD_META.version),
    __APP_BUILD_TIME__: JSON.stringify(BUILD_META.buildTime),
    __APP_GIT_SHA__: JSON.stringify(BUILD_META.gitSha),
  },
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
