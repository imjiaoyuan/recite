import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

// kokoro-js ships a Node entry (imports fs/path) and a self-contained browser bundle.
// Alias to the browser bundle so the dynamic import() in src/speech.ts loads the right one,
// and exclude it from dep pre-bundling (its inlined ONNX/WASM references trip up pre-bundling).
const kokoroWeb = fileURLToPath(
  new URL('./node_modules/kokoro-js/dist/kokoro.web.js', import.meta.url),
);

// base: './' keeps assets relative for GitHub Pages subpath deploys.
export default defineConfig({
  base: './',
  server: { open: true, port: 5173 },
  build: { outDir: 'dist', sourcemap: false },
  resolve: { alias: { 'kokoro-js': kokoroWeb } },
  optimizeDeps: { exclude: ['kokoro-js'] },
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
        // The kokoro engine chunk (~2 MB) is opt-in only — don't precache it for everyone
        // (avoids the 2 MiB Workbox limit and keeps the default install lean). It's fetched
        // on demand when the user enables offline TTS, then cached via the rule below.
        globIgnores: ['**/kokoro.web-*.js'],
        runtimeCaching: [
          {
            urlPattern: /\/data\/.*\.json$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'recite-data' },
          },
          {
            urlPattern: /\/assets\/kokoro\.web-.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'recite-kokoro',
              expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
        ],
      },
    }),
  ],
});
