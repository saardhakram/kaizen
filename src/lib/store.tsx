import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppState, Category, Ctx, Habit, Log, Theme } from '../types';
import { todayKey } from './date';
import { generate } from './sample';
import { DEFAULT_CATS, detect, uniq } from './tagger';
import { applyOp, settingsOf, type Op, type Settings } from './ops';
import { SyncEngine, type Snapshot, type SyncStatus } from './sync';
import { cloudFromEnv, localKV, type Cloud, type Session } from './cloud';

const KEY = 'kaizen.preview.v1';
const cacheKey = (uid: string) => `kaizen.cache.${uid}`;
const kv = localKV();

function parseState(raw: string | null): AppState | null {
  try {
    const p = raw ? JSON.parse(raw) : null;
    return p && Array.isArray(p.habits) && p.logs ? p : null;
  } catch {
    return null;
  }
}

const base = { cats: DEFAULT_CATS, focus: {}, theme: 'auto' as Theme, dayEnds: 3 };
const sampleState = (today: string): AppState => ({ ...base, ...generate(today), sample: true });
const blankState = (): AppState => ({ ...base, habits: [], logs: {}, sample: false });
const IDLE: SyncStatus = { pending: 0, syncing: false, online: true, error: null, lastSynced: null };

export type AuthStatus = 'loading' | 'out' | 'in';

interface Store {
  state: AppState;
  today: string;
  ctx: Ctx;
  /** local: this device only (the preview). cloud: signed-in account that syncs. */
  mode: 'local' | 'cloud';
  cloudLabel: 'supabase' | 'demo' | null;
  auth: { status: AuthStatus; email: string };
  /** false while a signed-in account is still loading its data for the first time */
  ready: boolean;
  sync: SyncStatus;
  setLog: (habitId: string, date: string, log: Log | null) => void;
  saveHabit: (h: Habit) => void;
  archiveHabit: (id: string, archived: boolean) => void;
  setCats: (cats: Category[]) => void;
  retag: () => void;
  setFocus: (month: string, ids: string[]) => void;
  setTheme: (t: Theme) => void;
  setDayEnds: (n: number) => void;
  loadSample: () => void;
  startFresh: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsConfirm: boolean }>;
  signOut: () => Promise<void>;
}

const Ctx_ = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx_);
  if (!s) throw new Error('StoreProvider missing');
  return s;
};

export function StoreProvider({ children, cloud: cloudProp }: { children: ReactNode; cloud?: Cloud | null }) {
  const cloud = useMemo(() => (cloudProp !== undefined ? cloudProp : cloudFromEnv()), [cloudProp]);

  const [state, setState] = useState<AppState>(() => {
    if (cloud) return blankState();
    const stored = parseState(kv.get(KEY));
    return stored ? { ...base, ...stored } : sampleState(todayKey(base.dayEnds));
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  const [auth, setAuth] = useState<{ status: AuthStatus; session: Session | null }>({ status: cloud ? 'loading' : 'in', session: null });
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncStatus>(IDLE);
  const engineRef = useRef<SyncEngine | null>(null);
  const uid = auth.session?.userId ?? null;

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const today = useMemo(() => todayKey(state.dayEnds), [state.dayEnds, tick]);

  // this-device-only mode keeps everything in the browser
  useEffect(() => {
    if (!cloud) kv.set(KEY, JSON.stringify(state));
  }, [state, cloud]);

  // who is signed in
  useEffect(() => {
    if (!cloud) return;
    let live = true;
    const set = (s: Session | null) => live && setAuth({ status: s ? 'in' : 'out', session: s });
    cloud.auth.session().then(set, () => set(null));
    const off = cloud.auth.onChange(set);
    return () => {
      live = false;
      off();
    };
  }, [cloud]);

  // the cloud's data, laid under any changes that have not been sent yet
  const onPull = useCallback((snap: Snapshot, pending: Op[]) => {
    let s: AppState = { ...stateRef.current, habits: snap.habits, logs: snap.logs, sample: false, ...(snap.settings ?? {}) };
    for (const op of pending) s = applyOp(s, op);
    stateRef.current = s;
    setState(s);
    // first sign-in on a new account: store the default reason categories
    if (!snap.settings && !pending.some((o) => o.k === 'settings')) engineRef.current?.push({ k: 'settings', settings: settingsOf(s) });
  }, []);

  // one sync engine per signed-in account
  useEffect(() => {
    if (!cloud) return;
    if (!uid) {
      stateRef.current = blankState();
      setState(stateRef.current);
      setLoadedFor(null);
      setSync(IDLE);
      return;
    }
    const cached = parseState(kv.get(cacheKey(uid)));
    stateRef.current = cached ? { ...blankState(), ...cached } : blankState();
    setState(stateRef.current);
    setLoadedFor(cached ? uid : null);

    const engine = new SyncEngine({
      remote: cloud.remote(uid),
      storage: kv,
      userId: uid,
      onPull,
      onStatus: (st) => {
        setSync(st);
        if (st.lastSynced !== null || !st.online || st.error) setLoadedFor(uid);
      },
    });
    engineRef.current = engine;
    void engine.sync();

    const goOnline = () => engine.setOnline(true);
    const goOffline = () => engine.setOnline(false);
    const refresh = () => {
      if (document.visibilityState === 'visible') void engine.sync();
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    document.addEventListener('visibilitychange', refresh);
    const timer = setInterval(refresh, 120_000);
    return () => {
      engine.dispose();
      if (engineRef.current === engine) engineRef.current = null;
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      document.removeEventListener('visibilitychange', refresh);
      clearInterval(timer);
    };
  }, [cloud, uid, onPull]);

  // keep a copy on this device so the app opens instantly and works offline
  const ready = !cloud || (uid !== null && loadedFor === uid);
  useEffect(() => {
    if (cloud && uid && ready) kv.set(cacheKey(uid), JSON.stringify(state));
  }, [state, cloud, uid, ready]);

  // theme: 'auto' leaves whatever the host page set; light/dark override it
  const hostTheme = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const el = document.documentElement;
    if (hostTheme.current === undefined) hostTheme.current = el.getAttribute('data-theme');
    if (state.theme === 'auto') {
      if (hostTheme.current) el.setAttribute('data-theme', hostTheme.current);
      else el.removeAttribute('data-theme');
    } else el.setAttribute('data-theme', state.theme);
  }, [state.theme]);

  /** the one way data changes: show it now, and queue it for the cloud */
  const dispatch = useCallback((op: Op) => {
    setState((s) => applyOp(s, op));
    engineRef.current?.push(op);
  }, []);
  const patchSettings = useCallback((patch: Partial<Settings>) => dispatch({ k: 'settings', settings: { ...settingsOf(stateRef.current), ...patch } }), [dispatch]);

  const setLog = useCallback((habitId: string, date: string, log: Log | null) => dispatch({ k: 'log', habitId, date, log }), [dispatch]);
  const saveHabit = useCallback((habit: Habit) => dispatch({ k: 'habit', habit }), [dispatch]);
  const archiveHabit = useCallback(
    (id: string, archived: boolean) => {
      const habit = stateRef.current.habits.find((h) => h.id === id);
      if (habit) dispatch({ k: 'habit', habit: { ...habit, archived } });
    },
    [dispatch],
  );
  const setCats = useCallback((cats: Category[]) => patchSettings({ cats }), [patchSettings]);
  const setFocus = useCallback((month: string, ids: string[]) => patchSettings({ focus: { ...stateRef.current.focus, [month]: ids } }), [patchSettings]);
  const setTheme = useCallback((theme: Theme) => patchSettings({ theme }), [patchSettings]);
  const setDayEnds = useCallback((dayEnds: number) => patchSettings({ dayEnds }), [patchSettings]);

  const retag = useCallback(() => {
    const s = stateRef.current;
    for (const [k, l] of Object.entries(s.logs)) {
      if ((l.status !== 'partial' && l.status !== 'missed') || !(l.reason || l.manual?.length)) continue;
      const found = uniq([...(l.manual || []), ...detect(l.reason || '', s.cats)]);
      const tags = found.length ? found : ['other'];
      if (JSON.stringify(tags) === JSON.stringify(l.tags)) continue;
      const [date, habitId] = k.split('|');
      dispatch({ k: 'log', habitId, date, log: { ...l, tags } });
    }
  }, [dispatch]);

  // sample data only exists on this device; it never goes into a real account
  const loadSample = useCallback(() => {
    if (!cloud) setState((s) => ({ ...sampleState(todayKey(s.dayEnds)), theme: s.theme, dayEnds: s.dayEnds }));
  }, [cloud]);
  const startFresh = useCallback(() => {
    if (!cloud) setState((s) => ({ ...s, habits: [], logs: {}, focus: {}, sample: false }));
  }, [cloud]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (cloud) await cloud.auth.signIn(email.trim(), password);
  }, [cloud]);
  const signUp = useCallback(async (email: string, password: string) => (cloud ? cloud.auth.signUp(email.trim(), password) : { needsConfirm: false }), [cloud]);
  const signOut = useCallback(async () => {
    if (!cloud) return;
    await engineRef.current?.flush(); // best effort: anything unsent stays queued on this device
    await cloud.auth.signOut();
  }, [cloud]);

  const ctx = useMemo<Ctx>(() => ({ habits: state.habits, logs: state.logs, cats: state.cats, today }), [state.habits, state.logs, state.cats, today]);

  const value = useMemo<Store>(
    () => ({
      state, today, ctx,
      mode: cloud ? 'cloud' : 'local',
      cloudLabel: cloud ? cloud.label : null,
      auth: { status: auth.status, email: auth.session?.email ?? '' },
      ready, sync,
      setLog, saveHabit, archiveHabit, setCats, retag, setFocus, setTheme, setDayEnds, loadSample, startFresh,
      signIn, signUp, signOut,
    }),
    [state, today, ctx, cloud, auth, ready, sync, setLog, saveHabit, archiveHabit, setCats, retag, setFocus, setTheme, setDayEnds, loadSample, startFresh, signIn, signUp, signOut],
  );
  return <Ctx_.Provider value={value}>{children}</Ctx_.Provider>;
}
