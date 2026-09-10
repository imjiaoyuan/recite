import { defineConfig, type Plugin } from 'vite';
import { VitePWA, type ManifestOptions } from 'vite-plugin-pwa';

// Everything except the name/description is chrome (icons, colours, display mode)
// and is language-independent.
const manifest: Partial<ManifestOptions> = {
  name: 'recite',
  short_name: 'recite',
  description: 'English vocabulary · spaced repetition, spelling, dictation',
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
};

// An installed app gets its name from a static manifest, so it cannot follow the UI
// language on its own. Emit a zh twin beside the default (English/neutral) one —
// both derived from the object above, so the icons and colours can't drift — and
// let public/lang.js point <link rel="manifest"> at it when the UI renders Chinese.
const manifestZh = {
  ...manifest,
  name: 'recite · 背单词',
  description: '英语背单词 · 间隔重复 / 拼写 / 听写',
  lang: 'zh-CN',
};

// Declared before VitePWA so the asset exists by the time it collects the bundle
// for the service-worker precache list.
function zhManifest(): Plugin {
  return {
    name: 'recite:zh-manifest',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.zh.webmanifest', source: JSON.stringify(manifestZh) });
    },
  };
}

// base: './' keeps assets relative for GitHub Pages subpath deploys.
export default defineConfig({
  base: './',
  server: { open: true, port: 5173 },
  build: { outDir: 'dist', sourcemap: false },
  plugins: [
    zhManifest(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.ico', 'icon-192.png', 'icon-512.png'],
      manifest,
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
