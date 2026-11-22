import type { Ctx, Habit } from '../types';
import { addDays, daysBetween, dowMon, DOW } from '../lib/date';
import { tally } from '../lib/stats';
import type { Col } from '../charts';

export const LEGEND_STATUS = [
  { name: 'Done', color: 'var(--done)' },
  { name: 'Partly', color: 'var(--partial)' },
  { name: 'Missed', color: 'var(--missed)' },
  { name: 'Not logged', color: 'var(--faint)' },
];

/** stacked columns for the seven days ending today */
export function last7Cols(ctx: Ctx, habits: Habit[]): Col[] {
  return daysBetween(addDays(ctx.today, -6), ctx.today).map((d) => {
    const t = tally(ctx, habits, d, d);
    const pending = t.applicable - t.graded - t.skip;
    return {
      label: DOW[dowMon(d)],
      hl: d === ctx.today,
      segs: [
        { v: t.done, color: 'var(--done)', name: 'done' },
        { v: t.partial, color: 'var(--partial)', name: 'partly' },
        { v: t.missed, color: 'var(--missed)', name: 'missed' },
        { v: pending, color: 'var(--faint)', name: 'not logged' },
      ],
    };
  });
}
