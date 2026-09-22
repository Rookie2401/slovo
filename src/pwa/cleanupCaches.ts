/**
 * The runtime data cache (vite.config.ts) is named `slovo-data-<hash of public/dict + public/corpus>`,
 * so a release that corrects any shipped data gets its own cache bucket instead of silently reusing
 * stale entries under the old name. Workbox's own `cleanupOutdatedCaches` only ever touches its
 * precache (the app shell); a Cache Storage bucket under a name it doesn't recognise — including our
 * previous data cache — is left behind forever unless something deletes it. Cache Storage is shared
 * between the page and the service worker, so the page can do this itself on every load. Ported from
 * Biblia's src/pwa/cleanupCaches.ts.
 */
declare const __DATA_VERSION__: string;

const PREFIX = 'slovo-data-';

export async function cleanupObsoleteDataCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const current = `${PREFIX}${__DATA_VERSION__}`;
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== current).map((k) => caches.delete(k)));
  } catch {
    // Cache Storage unavailable (private browsing, disabled storage, …) — nothing to clean up.
  }
}
