import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';

/** Says something only when there is something to say. Quiet when everything is saved. */
export function SyncPill() {
  const { mode, sync } = useStore();
  const n = sync.pending;
  const plural = n === 1 ? 'change' : 'changes';
  const kind = sync.error ? 'bad' : !sync.online ? 'warn' : n > 0 ? 'info' : '';
  const text = sync.error
    ? sync.error
    : !sync.online
      ? n
        ? `Offline. ${n} ${plural} will sync when you reconnect.`
        : 'Offline. Changes will sync when you reconnect.'
      : n > 0
        ? sync.syncing
          ? 'Saving…'
          : `${n} ${plural} waiting to sync`
        : '';

  // a normal tap saves in well under a second, so only show the plain "saving" state if it lingers
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (kind !== 'info') return setLate(false);
    const t = setTimeout(() => setLate(true), 1500);
    return () => clearTimeout(t);
  }, [kind]);

  if (mode !== 'cloud' || !kind || (kind === 'info' && !late)) return null;
  return (
    <div className="syncbar">
      <div className={'syncpill ' + kind} role="status">{text}</div>
    </div>
  );
}
