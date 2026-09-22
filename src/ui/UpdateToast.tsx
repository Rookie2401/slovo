import { useEffect, useState } from 'react';

/** Service worker in prompt mode: offer a reload when a new build is waiting. */
export function UpdateToast() {
  const [update, setUpdate] = useState<null | (() => Promise<void>)>(null);
  useEffect(() => {
    let cancelled = false;
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        const doUpdate = registerSW({
          onNeedRefresh() {
            if (!cancelled) setUpdate(() => () => doUpdate(true));
          },
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  if (!update) return null;
  return (
    <div className="update-toast" role="status">
      <span>A new version of Слово is ready.</span>
      <button className="btn btn--small btn--primary" onClick={() => void update()}>Reload</button>
      <button className="btn btn--small btn--quiet" onClick={() => setUpdate(null)}>Later</button>
    </div>
  );
}
