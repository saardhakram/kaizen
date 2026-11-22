import type { Habit, Log } from '../types';
import { enqueue, type Op, type Settings } from './ops';

export interface Snapshot {
  habits: Habit[];
  logs: Record<string, Log>;
  /** null the first time someone signs in */
  settings: Settings | null;
}

/** network: try again later. auth: signed out or token problem. rejected: the server will never accept this change. */
export type ErrorKind = 'network' | 'auth' | 'rejected';
export class RemoteError extends Error {
  kind: ErrorKind;
  constructor(message: string, kind: ErrorKind) {
    super(message);
    this.name = 'RemoteError';
    this.kind = kind;
  }
}

export interface Remote {
  fetchAll(): Promise<Snapshot>;
  apply(op: Op): Promise<void>;
}

export interface KV {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface SyncStatus {
  /** changes made on this device that the cloud has not confirmed yet */
  pending: number;
  syncing: boolean;
  online: boolean;
  error: string | null;
  lastSynced: number | null;
}

export interface EngineOptions {
  remote: Remote;
  storage: KV;
  userId: string;
  /** called with the cloud's data and the still-unsent changes, which the screen lays on top */
  onPull: (snap: Snapshot, pending: Op[]) => void;
  onStatus: (s: SyncStatus) => void;
  /** send changes shortly after they are made (default true) */
  autoFlush?: boolean;
  now?: () => number;
}

/**
 * Local-first sync. Changes are applied on screen immediately and kept in a queue that survives
 * closing the app. The queue is sent in order whenever a connection is available.
 */
export class SyncEngine {
  private q: Op[];
  private chain: Promise<unknown> = Promise.resolve();
  private status: SyncStatus;
  private active = 0;
  private fails = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(private o: EngineOptions) {
    this.q = this.load();
    this.status = {
      pending: this.q.length,
      syncing: false,
      online: typeof navigator === 'undefined' || navigator.onLine !== false,
      error: null,
      lastSynced: null,
    };
  }

  private get key() {
    return `kaizen.queue.${this.o.userId}`;
  }
  private load(): Op[] {
    try {
      const raw = this.o.storage.get(this.key);
      const v = raw ? JSON.parse(raw) : [];
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  private save() {
    if (this.disposed) return;
    try {
      this.o.storage.set(this.key, JSON.stringify(this.q));
    } catch {
      /* storage full or blocked: the queue still works in memory */
    }
  }
  private emit(p: Partial<SyncStatus>) {
    this.status = { ...this.status, ...p, pending: this.q.length };
    if (!this.disposed) this.o.onStatus(this.status);
  }

  /** the changes still waiting to be sent, oldest first */
  pending(): Op[] {
    return this.q.slice();
  }

  push(op: Op) {
    this.q = enqueue(this.q, op);
    this.save();
    this.emit({});
    if (this.o.autoFlush !== false) this.flushSoon();
  }

  /** send waiting changes. Resolves true when nothing is left waiting. */
  flush(): Promise<boolean> {
    return this.run(() => this.drain());
  }

  /** send waiting changes, then download the latest data */
  sync(): Promise<void> {
    return this.run(async () => {
      if (await this.drain()) await this.pull();
    });
  }

  setOnline(v: boolean) {
    this.emit({ online: v });
    if (v) void this.sync();
  }

  dispose() {
    this.disposed = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  private flushSoon() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, 300);
  }

  /** one job at a time, so a download never runs in the middle of an upload */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.chain.then(async () => {
      this.active++;
      this.emit({ syncing: true });
      try {
        return await fn();
      } finally {
        this.active--;
        this.emit({ syncing: this.active > 0 });
      }
    });
    this.chain = p.then(
      () => undefined,
      () => undefined,
    );
    return p;
  }

  private drop(op: Op) {
    const i = this.q.indexOf(op);
    if (i < 0) return; // a newer version replaced it while it was in flight: that one still needs sending
    this.q = [...this.q.slice(0, i), ...this.q.slice(i + 1)];
    this.save();
    this.emit({});
  }

  private async drain(): Promise<boolean> {
    let rejected = false;
    while (this.q.length) {
      const op = this.q[0];
      try {
        await this.o.remote.apply(op);
      } catch (e) {
        const kind: ErrorKind = e instanceof RemoteError ? e.kind : 'network';
        if (kind === 'rejected') {
          this.drop(op); // will never succeed, so do not let it block everything behind it
          rejected = true;
          this.emit({ error: `A change could not be saved: ${(e as Error).message}` });
          continue;
        }
        this.fail(kind);
        return false;
      }
      this.drop(op);
    }
    this.fails = 0;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.emit(rejected ? { online: true } : { online: true, error: null });
    return true;
  }

  private async pull() {
    try {
      const snap = await this.o.remote.fetchAll();
      if (this.disposed) return;
      this.o.onPull(snap, this.q.slice());
      this.emit({ online: true, lastSynced: (this.o.now ?? Date.now)() });
    } catch (e) {
      const kind: ErrorKind = e instanceof RemoteError ? e.kind : 'network';
      if (kind === 'rejected') {
        // usually: the database tables have not been created yet
        this.emit({ online: true, error: `Could not load your data: ${(e as Error).message}. Check that supabase/schema.sql has been run.` });
        return;
      }
      this.fail(kind);
    }
  }

  private fail(kind: 'network' | 'auth') {
    this.fails++;
    this.emit(kind === 'auth' ? { error: 'Your session expired. Sign in again to keep syncing.' } : { online: false });
    if (this.retryTimer || this.disposed) return;
    const wait = Math.min(60_000, 2000 * 2 ** Math.min(this.fails, 5));
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.sync();
    }, wait);
  }
}
