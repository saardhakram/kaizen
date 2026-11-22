import type { AppState, Category, Habit, Log, Theme } from '../types';
import { lk } from '../types';

/** The per-person settings that follow you between devices. */
export interface Settings {
  theme: Theme;
  dayEnds: number;
  cats: Category[];
  focus: Record<string, string[]>;
}

/**
 * Every change to your data is one of these. The screen applies it at once,
 * and the sync engine sends the same op to the cloud when it can.
 */
export type Op =
  | { k: 'log'; habitId: string; date: string; log: Log | null }
  | { k: 'habit'; habit: Habit }
  | { k: 'settings'; settings: Settings };

export const settingsOf = (s: Pick<AppState, 'theme' | 'dayEnds' | 'cats' | 'focus'>): Settings => ({
  theme: s.theme,
  dayEnds: s.dayEnds,
  cats: s.cats,
  focus: s.focus,
});

export const opKey = (op: Op) => (op.k === 'log' ? `log:${lk(op.habitId, op.date)}` : op.k === 'habit' ? `habit:${op.habit.id}` : 'settings');

export function applyOp(s: AppState, op: Op): AppState {
  switch (op.k) {
    case 'log': {
      const logs = { ...s.logs };
      const key = lk(op.habitId, op.date);
      if (op.log) logs[key] = op.log;
      else delete logs[key];
      return { ...s, logs };
    }
    case 'habit':
      return {
        ...s,
        habits: s.habits.some((h) => h.id === op.habit.id) ? s.habits.map((h) => (h.id === op.habit.id ? op.habit : h)) : [...s.habits, op.habit],
      };
    case 'settings':
      return { ...s, ...op.settings };
  }
}

/**
 * Add an op to the waiting list. A newer op about the same thing replaces the older one
 * in its original place, so the list stays short and a new habit always goes out before its logs.
 */
export function enqueue(queue: Op[], op: Op): Op[] {
  const key = opKey(op);
  const i = queue.findIndex((q) => opKey(q) === key);
  if (i < 0) return [...queue, op];
  const next = queue.slice();
  next[i] = op;
  return next;
}
