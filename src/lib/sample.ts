import type { Habit, Log, Status } from '../types';
import { lk } from '../types';
import { addDays, dow, daysBetween } from './date';
import { DEFAULT_CATS, detect, uniq } from './tagger';

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sampleHabits(today: string): Habit[] {
  const start = addDays(today, -160);
  const all = [0, 1, 2, 3, 4, 5, 6];
  return [
    { id: 'workout', name: 'Workout', emoji: '🏋️', kind: 'build', hue: 24, days: [1, 3, 5, 6], start },
    { id: 'study', name: 'Study 2 hours', emoji: '📚', kind: 'build', hue: 205, days: all, start },
    { id: 'water', name: 'Drink 3L water', emoji: '💧', kind: 'build', hue: 178, days: all, start },
    { id: 'meditate', name: 'Meditate 10 min', emoji: '🧘', kind: 'build', hue: 285, days: all, start },
    { id: 'sleep', name: 'Sleep by 11:30', emoji: '🌙', kind: 'build', hue: 250, days: all, start },
    { id: 'read', name: 'Read 20 pages', emoji: '📖', kind: 'build', hue: 48, days: all, start },
    { id: 'scroll', name: 'No doomscrolling', emoji: '📵', kind: 'quit', hue: 335, days: all, start },
    { id: 'junk', name: 'No junk food', emoji: '🍟', kind: 'quit', hue: 8, days: all, start },
  ];
}

const BASE: Record<string, number> = { workout: 0.72, study: 0.8, water: 0.78, meditate: 0.6, sleep: 0.5, read: 0.62, scroll: 0.42, junk: 0.55 };

/** how likely each reason is for each habit (unlisted reasons get a small default) */
const W: Record<string, Record<string, number>> = {
  workout: { laziness: 3, not_in_mood: 3, sick_tired: 2, exams: 1.5, functions: 1, distraction: 1 },
  study: { distraction: 3, laziness: 2.5, not_in_mood: 2, sick_tired: 1.5, functions: 1.5, stress: 1.5, friends: 1 },
  water: { forgot: 6, travel: 1, functions: 0.8, not_in_mood: 1, laziness: 1 },
  meditate: { forgot: 3, not_in_mood: 3, laziness: 2, exams: 1, travel: 1, stress: 1 },
  sleep: { distraction: 4, exams: 2.5, functions: 1.5, laziness: 1, stress: 1.5, friends: 1.5 },
  read: { distraction: 3, sick_tired: 2, not_in_mood: 2, laziness: 2, exams: 1.5 },
  scroll: { boredom: 4, stress: 2.5, laziness: 2, not_in_mood: 2, distraction: 1, friends: 0.5 },
  junk: { friends: 3, stress: 3, boredom: 3, functions: 2, laziness: 1.5, not_in_mood: 1.5, sick_tired: 0.8 },
};

const T: Record<string, string[]> = {
  laziness: ['Just felt lazy and kept putting it off', "Couldn't get myself off the bed", 'Procrastinated until it was too late', "Can't be bothered, honestly a lazy day"],
  not_in_mood: ["Wasn't in the mood today", "No motivation, didn't feel like doing anything", 'Low energy and just not feeling it', 'Felt off, zero motivation'],
  exams: ['DBMS exam tomorrow, was revising late', 'Internals this week, no time', 'Mock test prep ran long', 'Lab record submission deadline', 'Viva preparation took the whole evening'],
  functions: ["Cousin's wedding function, got back late", 'Family function all day', "Friend's birthday party", 'Temple festival with relatives', 'Engagement ceremony at home'],
  emergency: ['Had to rush to the hospital with a relative', 'Urgent call from home, dropped everything', 'Emergency at college, stayed till night'],
  sick_tired: ['Fever and headache', 'Slept badly, totally drained', 'Down with a cold, felt exhausted', 'Migraine all day', 'Stomach upset, felt weak'],
  forgot: ['Completely forgot about it', 'Slipped my mind after lunch', 'Lost track of time and forgot'],
  travel: ['On the train back home', 'Long bus journey, no chance', 'Travelling to Mysore for the weekend', 'Airport day, everything got shifted'],
  distraction: ['Got hooked on YouTube for hours', 'Endless reels, lost the evening', 'Binge-watching a series', 'Kept gaming with the roommates'],
  stress: ['Stressed about placements', "Anxious about results, couldn't focus", 'Overwhelmed with assignments'],
  boredom: ['Bored, nothing to do', 'Boring evening, drifted into it', 'Idle after dinner'],
  friends: ['Friends called me out for a hangout', 'Peer pressure at the canteen', 'Went out with the gang'],
};

/** wording for habits you are trying to quit: these are triggers */
const Q: Record<string, string[]> = {
  boredom: ['Bored in the evening, gave in without thinking', 'Nothing to do after dinner, ended up giving in'],
  stress: ['Stressed about submissions, comfort habit kicked in', 'Anxious about results, needed to zone out'],
  friends: ['Friends dragged me to the canteen', 'Peer pressure, everyone was doing it', 'Hung out with the gang, gave in'],
  distraction: ['Phone notification pulled me in for an hour', 'One reel turned into forty'],
  laziness: ['Too lazy to cook, ordered junk', 'Lazy evening, gave in'],
  functions: ['Family function, sweets everywhere', "Party night, couldn't say no"],
  not_in_mood: ["Wasn't in the mood to resist today", 'Not feeling it, gave in'],
  sick_tired: ['Exhausted, wanted comfort', 'Slept badly, craved it all day'],
};

const SUFFIX: Record<string, string> = {
  not_in_mood: "Honestly wasn't in the mood either.",
  sick_tired: 'Also felt exhausted.',
  distraction: 'And the phone kept distracting me.',
  stress: "Stress didn't help.",
  laziness: 'Plus I was feeling lazy.',
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function generate(today: string): { habits: Habit[]; logs: Record<string, Log> } {
  const habits = sampleHabits(today);
  const r = rng(20260919);
  const first = addDays(today, -160);
  const days = daysBetween(first, today);
  const n = days.length;

  const exam = new Set([...daysBetween(addDays(today, -100), addDays(today, -87)), ...daysBetween(addDays(today, -24), addDays(today, -12))]);
  const sick = new Set(daysBetween(addDays(today, -63), addDays(today, -59)));
  const travel = new Set(daysBetween(addDays(today, -41), addDays(today, -37)));
  const emergency = new Set([addDays(today, -75), addDays(today, -30)]);
  const fn = new Set<string>();
  days.forEach((d) => {
    if ((dow(d) === 0 || dow(d) === 6) && r() < 0.16) fn.add(d);
  });
  const unlogged = new Set([addDays(today, -2), addDays(today, -3)]);

  const logs: Record<string, Log> = {};

  const reasonFor = (h: Habit, ctx: { t: number; d: string }): { text: string; tags: string[] } => {
    const wts = W[h.id] || {};
    const cats = DEFAULT_CATS.filter((c) => c.id !== 'other');
    const weights = cats.map((c) => {
      let w = wts[c.id] ?? 0.15;
      if (c.id === 'exams' && exam.has(ctx.d)) w *= 12;
      if (c.id === 'sick_tired' && sick.has(ctx.d)) w *= 40;
      if (c.id === 'travel' && travel.has(ctx.d)) w *= 40;
      if (c.id === 'functions' && fn.has(ctx.d)) w *= 40;
      if (c.id === 'emergency' && emergency.has(ctx.d)) w *= 80;
      if (dow(ctx.d) === 0 && c.id === 'not_in_mood') w *= 2.5;
      if (dow(ctx.d) === 0 && c.id === 'laziness') w *= 1.5;
      if (c.id === 'laziness') w *= 1.8 - 1.2 * ctx.t;
      return w;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let x = r() * total;
    let idx = 0;
    for (; idx < weights.length; idx++) {
      x -= weights[idx];
      if (x <= 0) break;
    }
    const cat = cats[Math.min(idx, cats.length - 1)].id;
    const pool = (h.kind === 'quit' && Q[cat]) || T[cat] || T.laziness;
    let text = pool[Math.floor(r() * pool.length)];
    if (r() < 0.18) {
      const others = Object.keys(SUFFIX).filter((k) => k !== cat);
      text += ' ' + SUFFIX[others[Math.floor(r() * others.length)]];
    }
    return { text, tags: uniq([cat, ...detect(text, DEFAULT_CATS)]) };
  };

  days.forEach((d, i) => {
    if (d === today) return;
    if (unlogged.has(d)) return;
    const t = i / (n - 1);
    const wknd = dow(d) === 0 || dow(d) === 6;
    const dayFx = (r() - 0.5) * 0.3; // a good or bad day lifts every habit a little
    const eveFx = (r() - 0.5) * 1.0; // evening habits (sleep, scrolling, snacks) rise and fall together
    for (const h of habits) {
      if (!h.days.includes(dow(d))) continue;
      let p = BASE[h.id] + 0.12 * t + dayFx + (['sleep', 'scroll', 'junk'].includes(h.id) ? eveFx : 0);
      if (exam.has(d)) p += h.id === 'study' ? 0.1 : -0.18;
      if (sick.has(d)) p -= 0.5;
      if (travel.has(d)) p -= 0.35;
      if (fn.has(d)) p -= h.id === 'junk' ? 0.4 : 0.3;
      if (emergency.has(d)) p -= 0.6;
      if (wknd) p -= { study: 0.12, sleep: 0.15, scroll: 0.15, junk: 0.12 }[h.id] ?? 0;
      p = clamp(p, 0.05, 0.96);

      let status: Status;
      if ((sick.has(d) || travel.has(d)) && r() < 0.35) status = 'skip';
      else {
        const x = r();
        status = x < p ? 'done' : x < p + (1 - p) * 0.38 ? 'partial' : 'missed';
      }
      if (status === 'partial' || status === 'missed') {
        const { text, tags } = reasonFor(h, { t, d });
        logs[lk(h.id, d)] = { status, reason: text, tags };
      } else logs[lk(h.id, d)] = { status };
    }
  });

  // a few entries already ticked for today so the ring is not empty
  logs[lk('water', today)] = { status: 'done' };
  logs[lk('meditate', today)] = { status: 'done' };
  if (habits[0].days.includes(dow(today))) logs[lk('workout', today)] = { status: 'partial', reason: 'Cut it short, was not in the mood after lunch', tags: ['not_in_mood'] };

  return { habits, logs };
}
