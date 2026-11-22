import { vi } from 'vitest';

// Optional: pin the clock, e.g. VITE_TEST_DATE=2026-09-21T12:00:00 npx vitest run  (used to check every weekday)
const pinned = import.meta.env.VITE_TEST_DATE as string | undefined;
if (pinned) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(pinned));
}

// browser-only stubs; skipped for tests that run in plain Node (like the database tests)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
      matches: false, media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    }),
  });
  window.scrollTo = (() => {}) as typeof window.scrollTo;
}
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
