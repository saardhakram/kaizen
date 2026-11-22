import type { Habit, Log } from '../types';
import { lk } from '../types';
import { newId } from './id';
import type { Op, Settings } from './ops';
import { RemoteError, type KV, type Remote, type Snapshot } from './sync';
import { createSupabaseCloud } from './supabase';

export interface Session {
  userId: string;
  email: string;
}

export interface AuthClient {
  session(): Promise<Session | null>;
  onChange(cb: (s: Session | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  /** needsConfirm: the account exists but an email link must be clicked first */
  signUp(email: string, password: string): Promise<{ needsConfirm: boolean }>;
  signOut(): Promise<void>;
}

export interface Cloud {
  label: 'supabase' | 'demo';
  auth: AuthClient;
  remote(userId: string): Remote;
}

/** localStorage that never throws (private windows and sandboxed frames can block it) */
export function localKV(): KV {
  const mem = new Map<string, string>();
  return {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch {
        return mem.get(k) ?? null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch {
        mem.set(k, v);
      }
    },
  };
}

/**
 * DEMO CLOUD: accounts and data live in this browser only (nothing is sent anywhere, passwords are not protected).
 * It exists so the sign-in and sync flow can be tried and tested without a Supabase project.
 * Turn it on with VITE_SUPABASE_URL=demo.
 */
export function createDemoCloud(kv: KV = localKV()): Cloud {
  const USERS = 'kaizen.demo.users';
  const SESSION = 'kaizen.demo.session';
  const DATA = (id: string) => `kaizen.demo.data.${id}`;
  const listeners = new Set<(s: Session | null) => void>();
  const users = (): Record<string, { id: string; password: string }> => JSON.parse(kv.get(USERS) || '{}');
  const current = (): Session | null => {
    const s = kv.get(SESSION);
    return s ? JSON.parse(s) : null;
  };
  const notify = () => listeners.forEach((f) => f(current()));
  const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

  const auth: AuthClient = {
    async session() {
      return current();
    },
    onChange(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    async signIn(email, password) {
      const u = users()[email.trim().toLowerCase()];
      if (!u || u.password !== password) throw new Error("That email and password don't match.");
      kv.set(SESSION, JSON.stringify({ userId: u.id, email: email.trim() }));
      notify();
    },
    async signUp(email, password) {
      const key = email.trim().toLowerCase();
      const all = users();
      if (all[key]) throw new Error('An account with this email already exists. Sign in instead.');
      if (password.length < 8) throw new Error('Choose a longer password (at least 8 characters).');
      all[key] = { id: newId(), password };
      kv.set(USERS, JSON.stringify(all));
      kv.set(SESSION, JSON.stringify({ userId: all[key].id, email: email.trim() }));
      notify();
      return { needsConfirm: false };
    },
    async signOut() {
      kv.set(SESSION, '');
      notify();
    },
  };

  interface Data { habits: Habit[]; logs: Record<string, Log>; settings: Settings | null }
  const load = (id: string): Data => {
    const raw = kv.get(DATA(id));
    return raw ? JSON.parse(raw) : { habits: [], logs: {}, settings: null };
  };

  const remote = (userId: string): Remote => ({
    async fetchAll(): Promise<Snapshot> {
      if (offline()) throw new RemoteError('offline', 'network');
      return load(userId);
    },
    async apply(op: Op) {
      if (offline()) throw new RemoteError('offline', 'network');
      const d = load(userId);
      if (op.k === 'log') {
        if (op.log) d.logs[lk(op.habitId, op.date)] = op.log;
        else delete d.logs[lk(op.habitId, op.date)];
      } else if (op.k === 'habit') {
        d.habits = d.habits.some((h) => h.id === op.habit.id) ? d.habits.map((h) => (h.id === op.habit.id ? op.habit : h)) : [...d.habits, op.habit];
      } else d.settings = op.settings;
      kv.set(DATA(userId), JSON.stringify(d));
    },
  });

  return { label: 'demo', auth, remote };
}

/**
 * Which cloud to use, decided by how the app was started:
 *   npm run dev:demo        -> demo cloud (accounts live in this browser)
 *   the shareable preview   -> no cloud, this device only
 *   URL + key in .env.local -> your Supabase project
 *   nothing set             -> no cloud, this device only
 * A half-filled or mistyped .env.local throws a plain-English error that main.tsx shows on screen.
 */
export function cloudFromEnv(): Cloud | null {
  const mode = import.meta.env.MODE as string;
  if (mode === 'preview') return null;
  const url = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').trim();
  // Supabase now calls this the "publishable key"; older projects call it the "anon key". Either name works.
  const key = (((import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined) ?? '').trim();
  if (mode.startsWith('demo') || url === 'demo') return createDemoCloud();
  if (!url && !key) return null;
  if (!url) throw new Error('The key is set in .env.local but VITE_SUPABASE_URL is missing. Add your Project URL.');
  if (!key) throw new Error('VITE_SUPABASE_URL is set in .env.local but the key is missing. Add VITE_SUPABASE_PUBLISHABLE_KEY.');
  if (/YOUR-PROJECT|xxxxxxxx/i.test(url + key)) throw new Error('.env.local still has the placeholder values from .env.example. Replace them with your real Project URL and key.');
  let origin: string;
  try {
    origin = new URL(url).origin; // also drops any path pasted after the address
  } catch {
    throw new Error(`VITE_SUPABASE_URL ("${url}") is not a valid web address. It should look like https://abcdefgh.supabase.co`);
  }
  return createSupabaseCloud(origin, key);
}
