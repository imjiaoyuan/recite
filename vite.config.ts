import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// base: './' keeps assets relative for GitHub Pages subpath deploys.
export default defineConfig({
  base: './',
  server: { open: true, port: 5173 },
  build: { outDir: 'dist', sourcemap: false },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.ico', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'recite · 背单词',
        short_name: 'recite',
        description: '英语背单词 - 间隔重复 / 拼写 / 听写',
        theme_color: '#2e4dd6',
        background_color: '#faf8f4',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,ico,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: /\/data\/.*\.json$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'recite-data' },
          },
        ],
      },
    }),
  ],
});
