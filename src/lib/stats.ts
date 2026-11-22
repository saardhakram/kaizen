import type { Category, Ctx, Habit, Kind, Status } from '../types';
import { lk } from '../types';
import { addDays, addMonths, daysBetween, dow, dowMon, DOW_LONG, minKey, monthEnd, monthName, monthStart, weekStart } from './date';

export type Cell = 'na' | 'future' | 'unlogged' | Status;

export const scheduled = (h: Habit, date: string) => date >= h.start && h.days.includes(dow(date));

export function cellOf(ctx: Ctx, h: Habit, date: string): Cell {
  if (date > ctx.today) return 'future';
  if (!scheduled(h, date)) return 'na';
  const l = ctx.logs[lk(h.id, date)];
  return l ? l.status : 'unlogged';
}

export interface Filter {
  kind: 'all' | Kind;
  habit: string;
}
export const applyFilter = (habits: Habit[], f: Filter) =>
  habits.filter((h) => (f.kind === 'all' || h.kind === f.kind) && (f.habit === 'all' || h.id === f.habit));

export interface Tally {
  done: number;
  partial: number;
  missed: number;
  skip: number;
  unlogged: number;
  applicable: number;
  graded: number;
  score: number | null;
}

/** score = (done + half of partial) / graded. Skipped and unlogged days never count against you. */
export function tally(ctx: Ctx, habits: Habit[], from: string, to: string): Tally {
  const t: Tally = { done: 0, partial: 0, missed: 0, skip: 0, unlogged: 0, applicable: 0, graded: 0, score: null };
  for (const d of daysBetween(from, minKey(to, ctx.today))) {
    for (const h of habits) {
      const c = cellOf(ctx, h, d);
      if (c === 'na' || c === 'future') continue;
      t.applicable++;
      if (c === 'unlogged') {
        if (d !== ctx.today) t.unlogged++;
        continue;
      }
      t[c]++;
    }
  }
  t.graded = t.done + t.partial + t.missed;
  t.score = t.graded ? (t.done + 0.5 * t.partial) / t.graded : null;
  return t;
}

/** "never miss twice": a single miss pauses the chain, two in a row break it */
export function streaks(ctx: Ctx, h: Habit) {
  let run = 0;
  let best = 0;
  let misses = 0;
  for (const d of daysBetween(h.start, ctx.today)) {
    if (!scheduled(h, d)) continue;
    const l = ctx.logs[lk(h.id, d)];
    if (!l || l.status === 'skip') continue;
    if (l.status === 'done') {
      run++;
      misses = 0;
    } else if (l.status === 'partial') misses = 0;
    else {
      misses++;
      if (misses >= 2) run = 0;
    }
    if (run > best) best = run;
  }
  return { current: run, longest: best, atRisk: misses === 1 };
}

export interface Entry {
  habit: Habit;
  date: string;
  status: 'partial' | 'missed';
  tags: string[];
  primary: string;
  reason: string;
}

export function entries(ctx: Ctx, habits: Habit[], from: string, to: string): Entry[] {
  const out: Entry[] = [];
  for (const d of daysBetween(from, minKey(to, ctx.today))) {
    for (const h of habits) {
      const l = ctx.logs[lk(h.id, d)];
      if (!l || (l.status !== 'partial' && l.status !== 'missed')) continue;
      const tags = l.tags && l.tags.length ? l.tags : ['other'];
      out.push({ habit: h, date: d, status: l.status, tags, primary: tags[0], reason: l.reason || '' });
    }
  }
  return out;
}

export const catMap = (cats: Category[]) => new Map(cats.map((c) => [c.id, c]));

export function countPrimary(list: Entry[]) {
  const m = new Map<string, number>();
  list.forEach((e) => m.set(e.primary, (m.get(e.primary) || 0) + 1));
  return m;
}

/** days between two dates that have at least one log among the given habits */
export function loggedDays(ctx: Ctx, habits: Habit[]) {
  const ids = new Set(habits.map((h) => h.id));
  const days = new Set<string>();
  for (const k of Object.keys(ctx.logs)) {
    const [d, id] = k.split('|');
    if (ids.has(id) && d <= ctx.today) days.add(d);
  }
  return days.size;
}

export function unloggedDays(ctx: Ctx, habits: Habit[], lookback = 14) {
  const active = habits.filter((h) => !h.archived);
  const out: string[] = [];
  for (const d of daysBetween(addDays(ctx.today, -lookback), addDays(ctx.today, -1))) {
    if (active.some((h) => cellOf(ctx, h, d) === 'unlogged')) out.push(d);
  }
  return out;
}

export function weeklySeries(ctx: Ctx, habits: Habit[], weeks: number) {
  const thisWeek = weekStart(ctx.today);
  const out: { start: string; t: Tally }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const s = addDays(thisWeek, -7 * i);
    out.push({ start: s, t: tally(ctx, habits, s, addDays(s, 6)) });
  }
  return out;
}

/** Pearson correlation between habits' daily results (done=1, partial=.5, missed=0) */
export function correlation(ctx: Ctx, habits: Habit[], from: string, to: string) {
  const val = (h: Habit, d: string): number | null => {
    const c = cellOf(ctx, h, d);
    return c === 'done' ? 1 : c === 'partial' ? 0.5 : c === 'missed' ? 0 : null;
  };
  const days = daysBetween(from, minKey(to, ctx.today));
  const m: (number | null)[][] = habits.map(() => habits.map(() => null));
  const n: number[][] = habits.map(() => habits.map(() => 0));
  for (let i = 0; i < habits.length; i++) {
    for (let j = 0; j < habits.length; j++) {
      if (i === j) {
        m[i][j] = 1;
        continue;
      }
      const xs: number[] = [];
      const ys: number[] = [];
      for (const d of days) {
        const a = val(habits[i], d);
        const b = val(habits[j], d);
        if (a !== null && b !== null) {
          xs.push(a);
          ys.push(b);
        }
      }
      n[i][j] = xs.length;
      if (xs.length < 12) continue;
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
      const my = ys.reduce((a, b) => a + b, 0) / ys.length;
      let sxy = 0;
      let sxx = 0;
      let syy = 0;
      xs.forEach((x, k) => {
        sxy += (x - mx) * (ys[k] - my);
        sxx += (x - mx) ** 2;
        syy += (ys[k] - my) ** 2;
      });
      m[i][j] = sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
    }
  }
  return { m, n };
}

/** how many logged days it takes to get back to "done" after a miss */
export function recovery(ctx: Ctx, habits: Habit[]) {
  const buckets = [0, 0, 0, 0, 0]; // 1, 2, 3, 4-5, 6+
  let open = 0;
  let sum = 0;
  let count = 0;
  for (const h of habits) {
    const seq: Status[] = [];
    for (const d of daysBetween(h.start, ctx.today)) {
      if (!scheduled(h, d)) continue;
      const l = ctx.logs[lk(h.id, d)];
      if (!l || l.status === 'skip') continue;
      seq.push(l.status);
    }
    for (let i = 0; i < seq.length; i++) {
      if (seq[i] !== 'missed' || (i > 0 && seq[i - 1] === 'missed')) continue;
      let k = 0;
      let found = false;
      for (let j = i + 1; j < seq.length; j++) {
        k++;
        if (seq[j] === 'done') {
          found = true;
          break;
        }
      }
      if (!found) {
        open++;
        continue;
      }
      buckets[k <= 3 ? k - 1 : k <= 5 ? 3 : 4]++;
      sum += k;
      count++;
    }
  }
  return { buckets, open, avg: count ? sum / count : null, count };
}

export function weekdayScores(ctx: Ctx, habits: Habit[], from: string, to: string) {
  const acc = Array.from({ length: 7 }, () => ({ done: 0, partial: 0, graded: 0 }));
  for (const d of daysBetween(from, minKey(to, ctx.today))) {
    for (const h of habits) {
      const c = cellOf(ctx, h, d);
      if (c !== 'done' && c !== 'partial' && c !== 'missed') continue;
      const a = acc[dowMon(d)];
      a.graded++;
      if (c === 'done') a.done++;
      if (c === 'partial') a.partial++;
    }
  }
  return acc.map((a) => (a.graded >= 4 ? (a.done + 0.5 * a.partial) / a.graded : null));
}

export function perfectDays(ctx: Ctx, habits: Habit[], from: string, to: string) {
  let n = 0;
  for (const d of daysBetween(from, minKey(to, ctx.today))) {
    const t = tally(ctx, habits, d, d);
    if (t.graded >= 3 && t.done === t.graded) n++;
  }
  return n;
}

const TIPS: Record<string, string> = {
  laziness: 'Shrink the habit on low-energy days. A two-minute version still counts as partly done and keeps the chain alive.',
  not_in_mood: "Don't wait for the mood. Attach the habit to something you already do (after breakfast, after brushing) so it runs on autopilot.",
  distraction: 'Make distractions harder to reach: phone in another room, or an app timer during the habit window.',
  forgot: 'Give it a fixed time and a reminder. Forgetting is a system problem, not a discipline problem.',
  boredom: 'Plan a replacement for the boring gap, like a walk, a book or a call. Boredom slips fade once the slot is filled.',
  friends: 'Decide your line before you meet people: one sentence you will say when the plate goes around.',
  exams: 'Exam weeks are predictable. Log a planned minimum version for those weeks instead of letting the habit collapse.',
  functions: 'Mark known functions as skip days in advance, and do a light version the day after.',
  sick_tired: 'Protect sleep first. Most tired days trace back to the night before, so try a fixed lights-out time.',
  stress: 'Stress is a trigger, not a failure. Pick one five-minute reset (walk, breathing) to do before the habit you usually drop.',
  travel: 'Prepare a travel version of each habit (bodyweight workout, a book on the phone) so trips pause the chain instead of breaking it.',
  emergency: 'Emergencies are outside your control. Log them, mark skip days, and restart the next day.',
  other: 'Some reasons landed in Other. Open a few and add categories so the next review can be sharper.',
};

export interface Review {
  month: string;
  cur: Tally;
  prev: Tally;
  delta: number | null;
  headline: string;
  best?: { h: Habit; score: number };
  worst?: { h: Habit; score: number };
  top: { cat: Category; n: number; pct: number }[];
  total: number;
  controllablePct: number | null;
  peak?: { cat: Category; day: string };
  weakDay?: { day: string; score: number };
  recover: number | null;
  narrative: string[];
  tips: string[];
  focusOptions: { id: string; label: string }[];
}

export function buildReview(ctx: Ctx, month: string): Review | null {
  const habits = ctx.habits;
  const from = monthStart(month);
  const to = monthEnd(month);
  const prevM = addMonths(month, -1);
  const cur = tally(ctx, habits, from, to);
  if (cur.graded < 7) return null;
  const prev = tally(ctx, habits, monthStart(prevM), monthEnd(prevM));
  const cats = catMap(ctx.cats);
  const pct = (v: number) => Math.round(v * 100);
  const delta = cur.score !== null && prev.score !== null ? pct(cur.score) - pct(prev.score) : null;

  const rows = habits
    .map((h) => ({ h, t: tally(ctx, [h], from, to) }))
    .filter((r) => r.t.graded >= 5 && r.t.score !== null)
    .sort((a, b) => (b.t.score as number) - (a.t.score as number));
  const best = rows[0] ? { h: rows[0].h, score: rows[0].t.score as number } : undefined;
  const worstRow = rows[rows.length - 1];
  const worst = worstRow && worstRow !== rows[0] ? { h: worstRow.h, score: worstRow.t.score as number } : undefined;

  const ent = entries(ctx, habits, from, to);
  const counts = [...countPrimary(ent).entries()].sort((a, b) => b[1] - a[1]);
  const top = counts
    .map(([id, n]) => ({ cat: cats.get(id) as Category, n, pct: n / ent.length }))
    .filter((x) => x.cat);
  const ctrl = ent.filter((e) => cats.get(e.primary)?.controllable).length;
  const controllablePct = ent.length ? ctrl / ent.length : null;

  let peak: Review['peak'];
  if (top[0] && top[0].n >= 4) {
    const byDay = new Array(7).fill(0);
    ent.filter((e) => e.primary === top[0].cat.id).forEach((e) => byDay[dowMon(e.date)]++);
    const mx = Math.max(...byDay);
    if (mx / top[0].n >= 0.34) peak = { cat: top[0].cat, day: DOW_LONG[byDay.indexOf(mx)] };
  }

  const ws = weekdayScores(ctx, habits, from, to);
  let weakDay: Review['weakDay'];
  ws.forEach((s, i) => {
    if (s !== null && (!weakDay || s < weakDay.score)) weakDay = { day: DOW_LONG[i], score: s };
  });

  const rec = recovery(ctx, habits);

  const headline = delta === null ? 'Your first full picture' : delta >= 4 ? 'Trending up' : delta <= -4 ? 'A tougher month' : 'Holding steady';
  const mn = monthName(month);
  const pn = monthName(prevM);
  const narrative: string[] = [];
  let s1 = `You completed ${pct(cur.score as number)}% of the habits you logged in ${mn}`;
  if (delta !== null) s1 += delta > 0 ? `, up ${delta} points on ${pn}` : delta < 0 ? `, down ${-delta} points on ${pn}` : `, level with ${pn}`;
  s1 += '.';
  if (best) s1 += ` ${best.h.name} led at ${pct(best.score)}%`;
  if (worst) s1 += `${best ? ', while' : ''} ${worst.h.name} needs the most attention at ${pct(worst.score)}%.`;
  else if (best) s1 += '.';
  narrative.push(s1);

  if (ent.length >= 3 && top.length) {
    let s2 = `Of ${ent.length} slips and partial days, ${pct(controllablePct as number)}% trace back to things within your control`;
    const lead = top.slice(0, 2).map((x) => x.cat.label.toLowerCase());
    s2 += `. The biggest reasons were ${lead[0]}${lead[1] ? `, followed by ${lead[1]}` : ''}.`;
    if (peak) s2 += ` ${peak.cat.label} clusters on ${peak.day}s.`;
    narrative.push(s2);
  }
  if (rec.avg !== null) narrative.push(`After a miss you usually get back to done within ${rec.avg.toFixed(1)} logged days.`);

  const tips: string[] = [];
  const ctrlTop = top.filter((x) => x.cat.controllable);
  const extTop = top.filter((x) => !x.cat.controllable && x.cat.id !== 'other');
  ctrlTop.slice(0, 2).forEach((x) => tips.push(TIPS[x.cat.id] || `Look at your ${x.cat.label.toLowerCase()} entries and pick one small change.`));
  if (extTop[0]) tips.push(TIPS[extTop[0].cat.id] || `Plan ahead for ${extTop[0].cat.label.toLowerCase()}.`);
  if (tips.length < 3 && weakDay) tips.push(`${weakDay.day} is your weakest day at ${pct(weakDay.score)}%. Decide the night before what the minimum version looks like.`);
  if (tips.length < 3 && top.find((x) => x.cat.id === 'other')) tips.push(TIPS.other);

  const focusOptions = [
    ...ctrlTop.slice(0, 3).map((x) => ({ id: 'r:' + x.cat.id, label: x.cat.label })),
    ...(worst ? [{ id: 'h:' + worst.h.id, label: worst.h.name }] : []),
    ...(rows[rows.length - 2] && rows[rows.length - 2] !== rows[0] && rows[rows.length - 2].h.id !== worst?.h.id
      ? [{ id: 'h:' + rows[rows.length - 2].h.id, label: rows[rows.length - 2].h.name }]
      : []),
  ];

  return {
    month, cur, prev, delta, headline, best, worst, top, total: ent.length,
    controllablePct, peak, weakDay, recover: rec.avg, narrative, tips: tips.slice(0, 3), focusOptions,
  };
}
