import { useEffect, useState } from 'react';

interface InstallEvent extends Event {
  prompt(): Promise<void>;
}

// Browsers announce "this app can be installed" once, often before any screen is open, so listen from the start.
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    changed();
  });
}

/** A function that shows the browser's install dialog, or null when installing is not on offer. */
export function useInstall(): (() => Promise<void>) | null {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((t) => t + 1);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  if (!deferred) return null;
  return async () => {
    const d = deferred;
    if (!d) return;
    await d.prompt();
    deferred = null;
    changed();
  };
}
