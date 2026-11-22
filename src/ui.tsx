import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Lock, X } from 'lucide-react';
import type { Category, Habit, Status } from './types';

export const pct = (v: number | null | undefined) => (v === null || v === undefined ? '–' : Math.round(v * 100) + '%');

export const catColor = (c?: Category) => (!c || c.hue < 0 ? 'var(--other)' : `hsl(${c.hue} var(--cat-s) var(--cat-l))`);
export const habitColor = (h: Pick<Habit, 'hue'>) => `hsl(${h.hue} var(--cat-s) var(--cat-l))`;
export const statusVar: Record<Status, string> = {
  done: 'var(--done)',
  partial: 'var(--partial)',
  missed: 'var(--missed)',
  skip: 'var(--skip)',
};
export const cssVars = (o: Record<string, string | number>) => o as unknown as CSSProperties;

export function useMedia(q: string) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q).matches : false);
  const [m, setM] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener?.('change', f);
    f();
    return () => mq.removeEventListener?.('change', f);
  }, [q]);
  return m;
}

/** width of a container in px, kept up to date; charts draw at 1:1 so text stays readable */
export function useWidth<T extends HTMLElement>(fallback = 600) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const cw = el.clientWidth;
      if (cw > 0) setW(Math.round(cw));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function StatusIcon({ s, size = 18 }: { s: Status; size?: number }) {
  if (s === 'done') return <Check size={size} strokeWidth={3} aria-hidden />;
  if (s === 'missed') return <X size={size} strokeWidth={3} aria-hidden />;
  if (s === 'skip')
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
        <path d="M6 12h12" />
      </svg>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" />
    </svg>
  );
}

export function Modal({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="modal-root">
          <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <div className="sheet-wrap">
            <motion.div
              className="sheet"
              role="dialog"
              aria-modal="true"
              aria-label={label}
              initial={{ opacity: 0, y: 48 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 48 }}
              transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            >
              {children}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[]; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" className={o.v === value ? 'on' : ''} aria-pressed={o.v === value} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={'toggle' + (on ? ' on' : '')} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

export function Card({
  title, sub, scope, span = 6, children, locked, empty,
}: {
  title: string;
  sub?: string;
  scope?: string;
  span?: 4 | 6 | 8 | 12;
  children?: ReactNode;
  locked?: { have: number; need: number };
  empty?: string;
}) {
  return (
    <section className={`card s${span}`}>
      <header className="card-h">
        <h3>{title}</h3>
        {scope && <span className="scope">{scope}</span>}
      </header>
      {sub && <p className="card-sub">{sub}</p>}
      {locked ? (
        <div className="locked">
          <Lock size={18} aria-hidden />
          <div>
            <strong>Unlocks after {locked.need} days of logging.</strong>
            <div className="locked-bar" aria-hidden>
              <i style={{ width: `${Math.min(100, (locked.have / locked.need) * 100)}%` }} />
            </div>
            <span className="muted">You are at {locked.have}. Keep going.</span>
          </div>
        </div>
      ) : empty ? (
        <div className="empty">{empty}</div>
      ) : (
        children
      )}
    </section>
  );
}

export function Readout({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="readout" aria-live="polite">
      {text || <span className="muted">{hint ?? 'Tap or hover a value for details.'}</span>}
    </div>
  );
}
