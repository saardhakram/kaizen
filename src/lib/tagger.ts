import type { Category } from '../types';

/**
 * PREVIEW TAGGER: plain keyword matching.
 * In the live app this is replaced by an AI call (phase 3) that returns the same shape:
 * an ordered list of category ids, primary reason first.
 */
export const DEFAULT_CATS: Category[] = [
  { id: 'laziness', label: 'Laziness', emoji: '🛋️', hue: 24, controllable: true,
    keywords: ['lazy', 'laziness', 'procrastinat', "couldn't get", 'couldnt get', "can't be bothered", 'snooze', 'stayed in bed', "didn't bother", 'put it off', 'postponed', 'slacked'] },
  { id: 'not_in_mood', label: 'Not in the mood', emoji: '😶', hue: 262, controllable: true,
    keywords: ['mood', 'motivat', 'unmotivat', 'demotivat', "didn't feel like", 'not feeling', "wasn't feeling", 'low energy', 'no energy', 'felt off', 'meh'] },
  { id: 'exams', label: 'Exams and studies', emoji: '📝', hue: 214, controllable: false,
    keywords: ['exam', 'test', 'internal', 'viva', 'assignment', 'submission', 'revis', 'mock', 'quiz', 'deadline', 'lab record', 'semester', 'review'] },
  { id: 'functions', label: 'Functions and events', emoji: '🎉', hue: 330, controllable: false,
    keywords: ['function', 'wedding', 'marriage', 'party', 'birthday', 'festival', 'ceremony', 'reception', 'celebrat', 'get-together', 'get together', 'puja', 'engagement', 'family event'] },
  { id: 'emergency', label: 'Emergency', emoji: '🚨', hue: 356, controllable: false,
    keywords: ['emergency', 'hospital', 'urgent', 'accident', 'ambulance', 'rushed', 'rush to', 'crisis', 'admitted'] },
  { id: 'sick_tired', label: 'Sick or tired', emoji: '🤒', hue: 168, controllable: false,
    keywords: ['sick', 'fever', 'cold', 'cough', 'headache', 'ill', 'unwell', 'tired', 'exhaust', 'drained', 'sleepy', 'slept badly', 'slept late', 'migraine', 'cramp', 'fatigue', 'stomach', 'weak'] },
  { id: 'forgot', label: 'Forgot', emoji: '🫥', hue: 48, controllable: true,
    keywords: ['forgot', 'forget', 'slipped my mind', "didn't remember", 'lost track'] },
  { id: 'travel', label: 'Travel', emoji: '🚆', hue: 192, controllable: false,
    keywords: ['travel', 'trip', 'train', 'flight', 'bus', 'journey', 'airport', 'commut', 'road trip', 'on the way'] },
  { id: 'distraction', label: 'Distraction', emoji: '📱', hue: 292, controllable: true,
    keywords: ['youtube', 'reel', 'instagram', 'scroll', 'netflix', 'series', 'binge', 'gaming', 'game', 'phone', 'distract', 'social media', 'shorts', 'insta'] },
  { id: 'stress', label: 'Stress', emoji: '😰', hue: 100, controllable: false,
    keywords: ['stress', 'anxious', 'anxiety', 'overwhelm', 'worried', 'worry', 'panic', 'tension'] },
  { id: 'boredom', label: 'Boredom', emoji: '🥱', hue: 240, controllable: true,
    keywords: ['bored', 'boring', 'boredom', 'nothing to do', 'idle'] },
  { id: 'friends', label: 'Friends and peers', emoji: '🧑‍🤝‍🧑', hue: 140, controllable: true,
    keywords: ['friend', 'hangout', 'hang out', 'buddies', 'roommate', 'peer', 'canteen', 'outing', 'gang'] },
  { id: 'other', label: 'Other', emoji: '🔹', hue: -1, controllable: false, keywords: [] },
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'");

/** Returns category ids found in the text, ordered by where they first appear (primary first). */
export function detect(text: string, cats: Category[]): string[] {
  const t = norm(text);
  if (!t.trim()) return [];
  const hits: { id: string; at: number }[] = [];
  for (const c of cats) {
    let best = -1;
    for (const raw of c.keywords) {
      const kw = norm(raw.trim());
      if (!kw) continue;
      const m = new RegExp('(?:^|[^a-z0-9])' + esc(kw), 'i').exec(t);
      if (m) {
        const at = m.index + (m[0].length - kw.length);
        if (best < 0 || at < best) best = at;
      }
    }
    if (best >= 0) hits.push({ id: c.id, at: best });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.id);
}

export const uniq = <T,>(a: T[]) => Array.from(new Set(a));
