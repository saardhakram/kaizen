import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Habit, Log } from '../types';
import type { Op, Settings } from './ops';
import { RemoteError, type Remote, type Snapshot } from './sync';
import type { AuthClient, Cloud, Session } from './cloud';

/* ───────── row shapes (see supabase/schema.sql) ───────── */
export const habitToRow = (userId: string, h: Habit) => ({
  id: h.id, user_id: userId, name: h.name, emoji: h.emoji, kind: h.kind, hue: h.hue,
  days: h.days, start_date: h.start, archived: !!h.archived,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const rowToHabit = (r: any): Habit => ({
  id: r.id, name: r.name, emoji: r.emoji, kind: r.kind, hue: r.hue, days: r.days, start: r.start_date,
  ...(r.archived ? { archived: true } : {}),
});
export const logToRow = (userId: string, habitId: string, day: string, l: Log, now = new Date()) => ({
  user_id: userId, habit_id: habitId, day, status: l.status, reason: l.reason ?? null,
  tags: l.tags ?? [], manual: l.manual ?? [], updated_at: now.toISOString(),
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const rowToLog = (r: any): Log => ({
  status: r.status,
  ...(r.reason ? { reason: r.reason } : {}),
  ...(r.tags && r.tags.length ? { tags: r.tags } : {}),
  ...(r.manual && r.manual.length ? { manual: r.manual } : {}),
});
export const settingsToRow = (userId: string, s: Settings, now = new Date()) => ({
  user_id: userId, theme: s.theme, day_ends: s.dayEnds, cats: s.cats, focus: s.focus, updated_at: now.toISOString(),
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const rowToSettings = (r: any): Settings => ({ theme: r.theme, dayEnds: r.day_ends, cats: r.cats, focus: r.focus });

/** Sort a failed request into "try again later", "sign in again", or "the server said no". */
export function toRemoteError(e: { message?: string; code?: string }, status: number): RemoteError {
  const msg = e.message || 'Request failed';
  if (status === 0 || status >= 500 || status === 408 || status === 429 || /failed to fetch|network|load failed/i.test(msg)) return new RemoteError(msg, 'network');
  if (status === 401 || e.code === 'PGRST301' || /jwt/i.test(msg)) return new RemoteError(msg, 'auth');
  return new RemoteError(msg, 'rejected');
}

const PAGE = 1000; // Supabase returns at most 1000 rows per request, so read in pages

class SupabaseRemote implements Remote {
  constructor(private sb: SupabaseClient, private userId: string) {}

  private async all(table: string, order: string[]) {
    const out: unknown[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = this.sb.from(table).select('*');
      for (const o of order) q = q.order(o);
      const { data, error, status } = await q.range(from, from + PAGE - 1);
      if (error) throw toRemoteError(error, status);
      out.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    return out;
  }

  async fetchAll(): Promise<Snapshot> {
    const habits = (await this.all('habits', ['created_at', 'id'])).map(rowToHabit);
    const logRows = (await this.all('logs', ['day', 'habit_id'])) as { habit_id: string; day: string }[];
    const logs: Record<string, Log> = {};
    for (const r of logRows) logs[`${r.day}|${r.habit_id}`] = rowToLog(r);
    const { data, error, status } = await this.sb.from('user_settings').select('*').maybeSingle();
    if (error) throw toRemoteError(error, status);
    return { habits, logs, settings: data ? rowToSettings(data) : null };
  }

  async apply(op: Op): Promise<void> {
    let res;
    if (op.k === 'log') {
      res = op.log
        ? await this.sb.from('logs').upsert(logToRow(this.userId, op.habitId, op.date, op.log), { onConflict: 'habit_id,day' })
        : await this.sb.from('logs').delete().eq('habit_id', op.habitId).eq('day', op.date);
    } else if (op.k === 'habit') {
      res = await this.sb.from('habits').upsert(habitToRow(this.userId, op.habit), { onConflict: 'id' });
    } else {
      res = await this.sb.from('user_settings').upsert(settingsToRow(this.userId, op.settings), { onConflict: 'user_id' });
    }
    if (res.error) throw toRemoteError(res.error, res.status);
  }
}

const friendly = (m: string) =>
  /invalid login/i.test(m) ? "That email and password don't match."
  : /already registered|already been registered/i.test(m) ? 'An account with this email already exists. Sign in instead.'
  : /password.*(short|least|weak)/i.test(m) ? 'Choose a longer password (at least 8 characters).'
  : /rate limit|too many/i.test(m) ? 'Too many attempts. Wait a minute and try again.'
  : /fetch|network/i.test(m) ? 'Could not reach the server. Check your connection.'
  : m;

export function createSupabaseCloud(url: string, key: string): Cloud {
  const sb = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  const toSession = (u: { id: string; email?: string | null } | null | undefined): Session | null => (u ? { userId: u.id, email: u.email ?? '' } : null);
  const auth: AuthClient = {
    async session() {
      const { data } = await sb.auth.getSession();
      return toSession(data.session?.user);
    },
    onChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, s) => cb(toSession(s?.user)));
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(friendly(error.message));
    },
    async signUp(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw new Error(friendly(error.message));
      return { needsConfirm: !data.session };
    },
    async signOut() {
      await sb.auth.signOut();
    },
  };
  return { label: 'supabase', auth, remote: (userId) => new SupabaseRemote(sb, userId) };
}
