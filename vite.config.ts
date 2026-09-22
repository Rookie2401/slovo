import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Relative base + HashRouter: the built app runs from any static host, sub-path
// or file: URL. No book text is bundled; imports live in IndexedDB on the device.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        // the open-library volumes are fetched on demand when the reader adds them; only the small sample is precached
        globIgnores: ['**/corpus/bible-*.json', '**/corpus/storyweaver-*.json'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      manifest: {
        name: 'पाठ — Hindi Reader',
        short_name: 'पाठ',
        description: 'A Hindi literary reader with a linguistic apparatus underneath.',
        lang: 'hi',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f7f2e8',
        theme_color: '#7a3b2e',
        icons: [
          { src: './pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: './pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: './pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
});
