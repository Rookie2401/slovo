/**
 * Memoizes an in-flight or completed async result, but clears the memo the moment it rejects.
 * Without this, a transient network failure caches the *rejected* promise forever: every later
 * caller (a retry button, a remounted screen, a different chapter) gets handed the exact same
 * rejection and the resource can never load again without a full page reload. Concurrent callers
 * while a request is in flight still share the one underlying fetch.
 *
 * Copied verbatim from C:\Users\CJWal\dev\biblia-v0\src\data\asyncCache.ts (see PLAN.md §B).
 */
export function memoAsync<T>(box: { current: Promise<T> | null }, factory: () => Promise<T>): Promise<T> {
  if (!box.current) {
    box.current = factory().catch((e: unknown) => {
      box.current = null;
      throw e;
    });
  }
  return box.current;
}

/** Same as {@link memoAsync}, keyed (one memo per language, per shard path, …). */
export function memoAsyncKeyed<K extends string | number, T>(store: Partial<Record<K, Promise<T>>>, key: K, factory: () => Promise<T>): Promise<T> {
  const hit = store[key];
  if (hit) return hit;
  const p = factory().catch((e: unknown) => {
    delete store[key];
    throw e;
  });
  store[key] = p;
  return p;
}
