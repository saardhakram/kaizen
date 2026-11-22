export type Kind = 'build' | 'quit';
export type Status = 'done' | 'partial' | 'missed' | 'skip';
export type Theme = 'auto' | 'dark' | 'light';

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  kind: Kind;
  hue: number;
  /** 0 = Sunday … 6 = Saturday */
  days: number[];
  start: string;
  archived?: boolean;
}

export interface Log {
  status: Status;
  reason?: string;
  /** first tag is the primary reason */
  tags?: string[];
  /** tags the person picked by hand (kept when re-tagging) */
  manual?: string[];
}

export interface Category {
  id: string;
  label: string;
  emoji: string;
  /** -1 = neutral grey */
  hue: number;
  controllable: boolean;
  keywords: string[];
  custom?: boolean;
}

export interface AppState {
  habits: Habit[];
  logs: Record<string, Log>;
  cats: Category[];
  focus: Record<string, string[]>;
  theme: Theme;
  dayEnds: number;
  sample: boolean;
}

export interface Ctx {
  habits: Habit[];
  logs: Record<string, Log>;
  cats: Category[];
  today: string;
}

export const lk = (habitId: string, date: string) => `${date}|${habitId}`;

export const LABELS: Record<Kind, Record<Status, string>> = {
  build: { done: 'Done', partial: 'Partly', missed: 'Missed', skip: 'Skip' },
  quit: { done: 'Resisted', partial: 'Partly', missed: 'Slipped', skip: 'Skip' },
};

export interface EditTarget {
  habitId: string;
  date: string;
  status?: Status;
}
