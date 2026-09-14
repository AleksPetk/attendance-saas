type Refresh = () => Promise<unknown>;

export function createRefreshCoordinator() {
  const listeners = new Set<Refresh>();
  let running: Promise<void> | null = null;
  return {
    subscribe(callback: Refresh) { listeners.add(callback); return () => { listeners.delete(callback); }; },
    refresh(): Promise<void> {
      if (running) return running;
      running = Promise.allSettled([...listeners].map((callback) => Promise.resolve().then(callback)))
        .then(() => undefined).finally(() => { running = null; });
      return running;
    },
  };
}

export function installForegroundRefresh(windowTarget: EventTarget, documentTarget: EventTarget & { visibilityState: string }, refresh: () => Promise<void>) {
  let lastRefresh = 0;
  const foreground = () => {
    if (documentTarget.visibilityState === "hidden" || Date.now() - lastRefresh < 750) return;
    lastRefresh = Date.now();
    void refresh();
  };
  windowTarget.addEventListener("focus", foreground);
  documentTarget.addEventListener("visibilitychange", foreground);
  return () => {
    windowTarget.removeEventListener("focus", foreground);
    documentTarget.removeEventListener("visibilitychange", foreground);
  };
}

export const desktopRefresh = createRefreshCoordinator();
