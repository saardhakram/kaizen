// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { applyOp, enqueue, opKey, settingsOf, type Op, type Settings } from './lib/ops';
import { RemoteError, SyncEngine, type KV, type Remote, type Snapshot, type SyncStatus } from './lib/sync';
import { toCsv } from './lib/csv';
import { newId } from './lib/id';
import { DEFAULT_CATS } from './lib/tagger';
import { lk, type AppState, type Habit, type Log } from './types';

const habit = (id: string, name = id): Habit => ({ id, name, emoji: '✅', kind: 'build', hue: 100, days: [0, 1, 2, 3, 4, 5, 6], start: '2026-01-01' });
const empty = (): AppState => ({ habits: [], logs: {}, cats: DEFAULT_CATS, focus: {}, theme: 'auto', dayEnds: 3, sample: false });
const logOp = (habitId: string, date: string, status: Log['status'] | null, reason?: string): Op => ({ k: 'log', habitId, date, log: status ? { status, reason, tags: reason ? ['other'] : undefined } : null });

/** A pretend cloud. Enforces the same rule as the real database: a log needs its habit to exist first. */
class FakeRemote implements Remote {
  habits = new Map<string, Habit>();
  logs = new Map<string, Log>();
  settings: Settings | null = null;
  down = false;
  rejectKeys = new Set<string>();
  applied: string[] = [];
  async fetchAll(): Promise<Snapshot> {
    if (this.down) throw new RemoteError('offline', 'network');
    return { habits: [...this.habits.values()], logs: Object.fromEntries(this.logs), settings: this.settings };
  }
  async apply(op: Op) {
    if (this.down) throw new RemoteError('offline', 'network');
    if (this.rejectKeys.has(opKey(op))) throw new RemoteError('not allowed', 'rejected');
    if (op.k === 'log') {
      if (!this.habits.has(op.habitId)) throw new RemoteError('foreign key violation', 'rejected');
      if (op.log) this.logs.set(lk(op.habitId, op.date), op.log);
      else this.logs.delete(lk(op.habitId, op.date));
    } else if (op.k === 'habit') this.habits.set(op.habit.id, op.habit);
    else this.settings = op.settings;
    this.applied.push(opKey(op));
  }
}

const mem = (): KV & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v) };
};

function device(remote: FakeRemote, storage = mem(), uid = 'user-1') {
  let state = empty();
  let status: SyncStatus | null = null;
  const engine = new SyncEngine({
    remote, storage, userId: uid, autoFlush: false,
    onPull: (snap, pending) => {
      let s: AppState = { ...state, habits: snap.habits, logs: snap.logs, ...(snap.settings ?? {}) };
      for (const op of pending) s = applyOp(s, op);
      state = s;
    },
    onStatus: (s) => (status = s),
  });
  const act = (op: Op) => {
    state = applyOp(state, op);
    engine.push(op);
  };
  return { engine, act, storage, get state() { return state; }, get status() { return status as SyncStatus; } };
}

let remote: FakeRemote;
beforeEach(() => (remote = new FakeRemote()));

describe('ops', () => {
  it('applies a log, a habit and settings', () => {
    let s = applyOp(empty(), { k: 'habit', habit: habit('h1') });
    s = applyOp(s, logOp('h1', '2026-09-19', 'done'));
    s = applyOp(s, { k: 'settings', settings: { ...settingsOf(s), theme: 'dark' } });
    expect(s.habits).toHaveLength(1);
    expect(s.logs[lk('h1', '2026-09-19')].status).toBe('done');
    expect(s.theme).toBe('dark');
    expect(applyOp(s, logOp('h1', '2026-09-19', null)).logs).toEqual({});
  });

  it('replaces an older op about the same thing in its original place', () => {
    let q: Op[] = [];
    q = enqueue(q, { k: 'habit', habit: habit('h1', 'Read') });
    q = enqueue(q, logOp('h1', '2026-09-19', 'missed', 'lazy'));
    q = enqueue(q, { k: 'habit', habit: habit('h1', 'Read more') });
    q = enqueue(q, logOp('h1', '2026-09-19', 'done'));
    expect(q).toHaveLength(2);
    expect(q[0].k).toBe('habit');
    expect((q[0] as { habit: Habit }).habit.name).toBe('Read more');
    expect((q[1] as { log: Log }).log.status).toBe('done');
  });
});

describe('sync engine', () => {
  it('sends changes in order, so a new habit arrives before its logs', async () => {
    const d = device(remote);
    d.act({ k: 'habit', habit: habit('h1') });
    d.act(logOp('h1', '2026-09-19', 'done'));
    d.act({ k: 'habit', habit: habit('h1', 'Renamed') }); // edited again before anything was sent
    await d.engine.flush();
    expect(remote.applied).toEqual(['habit:h1', 'log:2026-09-19|h1']);
    expect(remote.habits.get('h1')?.name).toBe('Renamed');
    expect(d.status.pending).toBe(0);
  });

  it('keeps every change while offline and sends them all on reconnect', async () => {
    const d = device(remote);
    d.act({ k: 'habit', habit: habit('h1') });
    await d.engine.flush();
    remote.down = true;
    d.act(logOp('h1', '2026-09-18', 'done'));
    d.act(logOp('h1', '2026-09-19', 'missed', 'exam tomorrow'));
    expect(await d.engine.flush()).toBe(false);
    expect(d.status.online).toBe(false);
    expect(d.status.pending).toBe(2);
    expect(remote.logs.size).toBe(0);
    remote.down = false;
    await d.engine.sync();
    expect(remote.logs.size).toBe(2);
    expect(d.status.pending).toBe(0);
    expect(d.status.online).toBe(true);
    expect(d.status.lastSynced).not.toBeNull();
  });

  it('survives closing the app: the waiting list is restored on the next start', async () => {
    const storage = mem();
    remote.down = true;
    const first = device(remote, storage);
    first.act({ k: 'habit', habit: habit('h1') });
    first.act(logOp('h1', '2026-09-19', 'done'));
    await first.engine.flush();
    first.engine.dispose();

    remote.down = false;
    const second = device(remote, storage);
    expect(second.engine.pending()).toHaveLength(2);
    await second.engine.sync();
    expect(remote.logs.get(lk('h1', '2026-09-19'))?.status).toBe('done');
    expect(second.engine.pending()).toHaveLength(0);
  });

  it('does not lose an edit made while the earlier version is being sent', async () => {
    const d = device(remote);
    d.act({ k: 'habit', habit: habit('h1') });
    d.act(logOp('h1', '2026-09-19', 'missed', 'lazy'));
    const orig = remote.apply.bind(remote);
    let edited = false;
    remote.apply = async (op) => {
      await orig(op);
      if (!edited && op.k === 'log') {
        edited = true;
        d.act(logOp('h1', '2026-09-19', 'done')); // changed my mind mid-send
      }
    };
    await d.engine.flush();
    expect(remote.logs.get(lk('h1', '2026-09-19'))?.status).toBe('done');
    expect(d.engine.pending()).toHaveLength(0);
  });

  it('drops a change the server refuses without blocking the ones behind it', async () => {
    const d = device(remote);
    d.act({ k: 'habit', habit: habit('h1') });
    d.act(logOp('h1', '2026-09-18', 'done'));
    d.act(logOp('h1', '2026-09-19', 'done'));
    remote.rejectKeys.add('log:2026-09-18|h1');
    expect(await d.engine.flush()).toBe(true);
    expect(remote.logs.has(lk('h1', '2026-09-19'))).toBe(true);
    expect(d.status.error).toMatch(/could not be saved/);
    expect(d.engine.pending()).toHaveLength(0);
  });

  it("merges another device's changes and keeps your unsent ones on top", async () => {
    const phone = device(remote, mem(), 'user-1');
    const laptop = device(remote, mem(), 'user-1');
    phone.act({ k: 'habit', habit: habit('h1') });
    await phone.engine.flush();
    await laptop.engine.sync();
    expect(laptop.state.habits).toHaveLength(1);

    phone.act(logOp('h1', '2026-09-18', 'done'));
    await phone.engine.flush();

    remote.down = false;
    laptop.act(logOp('h1', '2026-09-19', 'partial', 'tired')); // made on the laptop, not sent yet
    await laptop.engine.sync(); // sends it, then downloads the phone's entry
    expect(laptop.state.logs[lk('h1', '2026-09-18')]?.status).toBe('done');
    expect(laptop.state.logs[lk('h1', '2026-09-19')]?.status).toBe('partial');
    expect(remote.logs.size).toBe(2);
  });

  it('shows your unsent change even if a download happens first', async () => {
    const d = device(remote);
    d.act({ k: 'habit', habit: habit('h1') });
    await d.engine.flush();
    remote.down = true;
    d.act(logOp('h1', '2026-09-19', 'done'));
    remote.down = false;
    // download without sending (as if the send had not happened yet)
    const snap = await remote.fetchAll();
    let s: AppState = { ...d.state, habits: snap.habits, logs: snap.logs };
    for (const op of d.engine.pending()) s = applyOp(s, op);
    expect(s.logs[lk('h1', '2026-09-19')]?.status).toBe('done');
  });

  it('reports missing tables clearly instead of pretending to be offline', async () => {
    remote.fetchAll = async () => {
      throw new RemoteError("Could not find the table 'public.habits'", 'rejected');
    };
    const d = device(remote);
    await d.engine.sync();
    expect(d.status.error).toMatch(/schema\.sql/);
    expect(d.status.online).toBe(true);
  });
});

describe('csv and ids', () => {
  it('exports readable rows and defuses spreadsheet formulas', () => {
    const s = empty();
    s.habits = [habit('h1', 'Read, daily'), { ...habit('h2', 'No junk'), kind: 'quit' }];
    s.logs[lk('h1', '2026-09-19')] = { status: 'missed', reason: 'said "no", then =HYPERLINK("x")', tags: ['laziness', 'boredom'] };
    s.logs[lk('h2', '2026-09-18')] = { status: 'done' };
    s.logs[lk('gone', '2026-09-18')] = { status: 'done' }; // habit no longer exists: skipped
    s.logs[lk('h1', '2026-09-20')] = { status: 'missed', reason: '=HYPERLINK("http://example.com","click")', tags: ['other'] };
    const csv = toCsv(s);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe('date,habit,type,result,main_reason,all_reasons,note');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('2026-09-18,No junk,quit,Resisted,,,');
    expect(lines[2]).toContain('"Read, daily",build,Missed,Laziness,Laziness; Boredom,');
    expect(lines[2]).toContain('""no""'); // quotes doubled
    // a note that STARTS with = would run as a formula in Excel: it must be defused
    expect(lines[3]).toContain(`'=HYPERLINK`);
    expect(lines[3]).not.toMatch(/,=HYPERLINK|,"=HYPERLINK/);
  });

  it('makes valid, unique ids', () => {
    const a = newId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newId()).not.toBe(a);
  });
});
