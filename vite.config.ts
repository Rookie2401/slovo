import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * A fingerprint of the shipped dictionary + corpus (public/dict, public/corpus): the full bytes of
 * every file, not just sizes, so any correction gives the runtime data cache below a fresh name, and
 * a returning user's stale cache from a previous release is never served past that release (see
 * src/pwa/cleanupCaches.ts, which deletes the old bucket). Ported from Biblia's vite.config.ts.
 */
export function hashDataDirs(dirs: string[]): string {
  const hash = crypto.createHash('sha256');
  const lenBuf = Buffer.alloc(4);
  const writeFramed = (buf: Buffer) => {
    lenBuf.writeUInt32LE(buf.length, 0);
    hash.update(lenBuf);
    hash.update(buf);
  };
  const walk = (base: string, dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(base, p);
      else {
        const relPath = path.relative(base, p).split(path.sep).join('/');
        writeFramed(Buffer.from(relPath, 'utf8'));
        writeFramed(fs.readFileSync(p));
      }
    }
  };
  for (const dir of dirs) walk(dir, dir);
  return hash.digest('hex');
}

export const dataVersion = hashDataDirs([path.join(root, 'public', 'dict'), path.join(root, 'public', 'corpus')]);
export const DATA_CACHE_MAX_ENTRIES = 2000;
export const dataCacheName = `slovo-data-${dataVersion}`;
export const dataRuntimeCaching = [
  {
    urlPattern: ({ url }: { url: URL }) => /\/(dict|corpus)\/.+\.json$/.test(url.pathname),
    handler: 'StaleWhileRevalidate' as const,
    options: { cacheName: dataCacheName, expiration: { maxEntries: DATA_CACHE_MAX_ENTRIES }, cacheableResponse: { statuses: [0, 200] } },
  },
];

// Relative base + HashRouter: the built app runs from any static host, sub-path or file: URL.
// The app shell is precached; the dictionary shards and corpus texts under dict/ and corpus/ are
// fetched on demand and cached as they are read (stale-while-revalidate under a data-version-scoped
// cache name — once a book or a dictionary shard has been opened it is available offline, and a
// release with corrected data is never served from an old release's cache indefinitely).
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
  define: { __DATA_VERSION__: JSON.stringify(dataVersion) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/dict/**', '**/corpus/**'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: dataRuntimeCaching,
      },
      manifest: {
        name: 'Слово',
        short_name: 'Слово',
        description: 'Dostoevsky and Tolstoy in the original, with the apparatus underneath.',
        lang: 'ru',
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
