const P = (n: number) => String(n).padStart(2, '0');

export const key = (d: Date) => `${d.getFullYear()}-${P(d.getMonth() + 1)}-${P(d.getDate())}`;
export const parse = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};
export const addDays = (k: string, n: number) => {
  const d = parse(k);
  d.setDate(d.getDate() + n);
  return key(d);
};

const dowCache = new Map<string, number>();
/** 0 = Sunday */
export const dow = (k: string) => {
  let v = dowCache.get(k);
  if (v === undefined) {
    v = parse(k).getDay();
    dowCache.set(k, v);
  }
  return v;
};
/** 0 = Monday */
export const dowMon = (k: string) => (dow(k) + 6) % 7;

export const diffDays = (a: string, b: string) => Math.round((parse(a).getTime() - parse(b).getTime()) / 864e5);
export const monthOf = (k: string) => k.slice(0, 7);
export const monthStart = (m: string) => `${m}-01`;
export const monthEnd = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return key(new Date(y, mo, 0, 12));
};
export const addMonths = (m: string, n: number) => {
  const [y, mo] = m.split('-').map(Number);
  return key(new Date(y, mo - 1 + n, 1, 12)).slice(0, 7);
};
export const daysBetween = (from: string, to: string) => {
  const out: string[] = [];
  let k = from;
  while (k <= to) {
    out.push(k);
    k = addDays(k, 1);
  }
  return out;
};
export const weekStart = (k: string) => addDays(k, -dowMon(k));
export const minKey = (a: string, b: string) => (a < b ? a : b);

/** "today" honours a custom end-of-day hour so 12:30 AM still counts as yesterday */
export const todayKey = (dayEnds: number, now = new Date()) => key(new Date(now.getTime() - dayEnds * 3600_000));

export const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DOW_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** JS getDay() values in Monday-first order */
export const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const fmtShort = (k: string) => parse(k).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const fmtDay = (k: string) => parse(k).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtLong = (k: string) => parse(k).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
export const monthLabel = (m: string) => parse(monthStart(m)).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
export const monthName = (m: string) => parse(monthStart(m)).toLocaleDateString('en-US', { month: 'long' });
export const monthShort = (k: string) => parse(k).toLocaleDateString('en-US', { month: 'short' });
