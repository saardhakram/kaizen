import type { Category, Ctx, Habit } from '../types';
import { Card, catColor, habitColor, pct } from '../ui';
import {
  Bars, Bullets, Columns, Donut, HabitCal, LineChart, Matrix, PairedBars, Radar, Ring, Sankey, StackedArea, YearHeat,
  type BarRow, type HeatDay, type MCell, type Slice,
} from '../charts';
import { addDays, addMonths, daysBetween, DOW, fmtShort, monthEnd, monthStart, parse, weekStart, diffDays, minKey } from '../lib/date';
import {
  type Entry, catMap, cellOf, correlation, countPrimary, entries, loggedDays, perfectDays, recovery, scheduled, streaks, tally, weekdayScores, weeklySeries,
} from '../lib/stats';
import { last7Cols, LEGEND_STATUS } from './derive';

export interface Scope {
  ctx: Ctx;
  habits: Habit[];
  all: Habit[];
  month: string;
  from: string;
  to: string;
}

const NEED = 14;
const from90 = (ctx: Ctx) => addDays(ctx.today, -89);
const pctNum = (v: number) => Math.round(v) + '%';

function splitRows(list: Entry[], cmap: Map<string, Category>): BarRow[] {
  const by = new Map<string, { p: number; m: number }>();
  list.forEach((e) => {
    const o = by.get(e.primary) || { p: 0, m: 0 };
    if (e.status === 'partial') o.p++;
    else o.m++;
    by.set(e.primary, o);
  });
  return [...by.entries()]
    .sort((a, b) => b[1].p + b[1].m - (a[1].p + a[1].m))
    .slice(0, 9)
    .map(([id, o]) => ({ key: id, label: cmap.get(id)?.label ?? id, emoji: cmap.get(id)?.emoji, right: String(o.p + o.m), segs: [{ v: o.m, color: 'var(--missed)', name: 'missed' }, { v: o.p, color: 'var(--partial)', name: 'partly' }] }));
}

/* ═══════════════════════════ Overview ═══════════════════════════ */
export function OverviewTab({ ctx, habits, month, from, to }: Scope) {
  const today = ctx.today;
  const live = habits.filter((h) => !h.archived);
  const todays = live.filter((h) => scheduled(h, today));
  const tDay = tally(ctx, todays, today, today);
  const dayGraded = todays.length - tDay.skip;
  const dayVal = dayGraded > 0 ? (tDay.done + 0.5 * tDay.partial) / dayGraded : 0;
  const tWeek = tally(ctx, habits, addDays(today, -6), today);
  const tMonth = tally(ctx, habits, from, to);

  // trend with trailing 7-day average
  const dates = daysBetween(addDays(from, -6), monthEnd(month));
  const scores = dates.map((d) => (d > today ? null : tally(ctx, habits, d, d).score));
  const roll = dates.map((_, i) => {
    if (i < 6 || dates[i] > today) return null;
    const w = scores.slice(i - 6, i + 1).filter((v): v is number => v !== null);
    return w.length >= 3 ? w.reduce((a, b) => a + b, 0) / w.length : null;
  });
  const hasTrend = scores.slice(6).some((v) => v !== null);

  // month vs last month
  const pm = addMonths(month, -1);
  const prevT = tally(ctx, habits, monthStart(pm), monthEnd(pm));
  const spanDays = (f: string, t: string) => Math.max(1, diffDays(minKey(t, today), f) + 1);
  const wk = (n: number, days: number) => (n / days) * 7;
  const curDays = spanDays(from, monthEnd(month));
  const prevDays = spanDays(monthStart(pm), monthEnd(pm));
  const cover = (t: typeof tMonth) => (t.applicable ? ((t.applicable - t.unlogged) / t.applicable) * 100 : 0);
  const pairs = [
    { label: 'Completion', a: (prevT.score ?? 0) * 100, b: (tMonth.score ?? 0) * 100, fmt: pctNum, good: 'up' as const },
    { label: 'Missed per week', a: wk(prevT.missed, prevDays), b: wk(tMonth.missed, curDays), fmt: (v: number) => v.toFixed(1), good: 'down' as const },
    { label: 'Perfect days per week', a: wk(perfectDays(ctx, habits, monthStart(pm), monthEnd(pm)), prevDays), b: wk(perfectDays(ctx, habits, from, to), curDays), fmt: (v: number) => v.toFixed(1), good: 'up' as const },
    { label: 'Days logged', a: cover(prevT), b: cover(tMonth), fmt: pctNum, good: 'up' as const },
  ];

  // year heatmap
  const start = addDays(weekStart(today), -52 * 7);
  const weeks: HeatDay[][] = Array.from({ length: 53 }, (_, w) =>
    Array.from({ length: 7 }, (_, r) => {
      const date = addDays(start, w * 7 + r);
      const future = date > today;
      return { date, future, score: future ? null : tally(ctx, habits, date, date).score };
    }),
  );

  return (
    <>
      <Card title="Completion" sub="Half credit for partly done. Skipped and unlogged days never count against you." scope="Today, 7 days, month" span={12}>
        <div className="rings">
          <figure><Ring value={dayVal} size={132} stroke={13} big={todays.length ? pct(dayVal) : '–'} label={`Today ${pct(dayVal)}`} /><figcaption>Today</figcaption></figure>
          <figure><Ring value={tWeek.score ?? 0} size={132} stroke={13} big={pct(tWeek.score)} label={`Last 7 days ${pct(tWeek.score)}`} /><figcaption>Last 7 days</figcaption></figure>
          <figure><Ring value={tMonth.score ?? 0} size={132} stroke={13} big={pct(tMonth.score)} label={`Month ${pct(tMonth.score)}`} /><figcaption>This month</figcaption></figure>
        </div>
      </Card>

      <Card title="Last 7 days" sub="Habits logged each day, stacked by result." scope="Ending today" span={6}>
        <Columns cols={last7Cols(ctx, habits)} height={190} legend={LEGEND_STATUS} />
      </Card>

      <Card title="Daily score and 7-day average" scope="Selected month" span={6} empty={hasTrend ? undefined : 'No logged days in this month yet.'}>
        <LineChart
          labels={dates.slice(6).map((d) => String(parse(d).getDate()))}
          series={[
            { name: 'Daily score', color: 'var(--muted)', values: scores.slice(6), dots: true, width: 1 },
            { name: '7-day average', color: 'var(--accent)', values: roll.slice(6), width: 3, area: true },
          ]}
        />
      </Card>

      <Card title="This month against last month" sub="Rates, so a shorter or unfinished month is still fair." scope="Selected month" span={12} empty={prevT.graded + tMonth.graded === 0 ? 'Log a couple of weeks to compare months.' : undefined}>
        <PairedBars rows={pairs} prevLabel="Last month" curLabel="This month" />
      </Card>

      <Card title="The whole year" sub="Every square is a day, shaded by how much you completed." scope="Last 12 months" span={12}>
        <YearHeat weeks={weeks} />
      </Card>
    </>
  );
}

/* ═══════════════════════════ Habits ═══════════════════════════ */
export function HabitsTab({ ctx, habits, all, month, from, to }: Scope) {
  const today = ctx.today;
  const live = habits.filter((h) => !h.archived);
  const cal0 = addDays(weekStart(today), -25 * 7);
  const cmap = catMap(ctx.cats);
  const hasQuit = habits.some((h) => h.kind === 'quit');
  const quitRows = splitRows(entries(ctx, habits.filter((h) => h.kind === 'quit'), from90(ctx), today), cmap);

  const ranked = live
    .map((h) => ({ h, t: tally(ctx, [h], from, to) }))
    .sort((a, b) => (b.t.score ?? -1) - (a.t.score ?? -1));
  const rankRows: BarRow[] = ranked.map(({ h, t }) => ({
    key: h.id, label: h.name, emoji: h.emoji, right: pct(t.score),
    segs: [{ v: (t.score ?? 0) * 100, color: habitColor(h), name: 'percent' }],
  }));

  const streakRows = live
    .map((h) => ({ h, s: streaks(ctx, h) }))
    .sort((a, b) => b.s.current - a.s.current)
    .map(({ h, s }) => ({ key: h.id, label: h.name, emoji: h.emoji, current: s.current, longest: s.longest, atRisk: s.atRisk }));

  const build = weeklySeries(ctx, all.filter((h) => h.kind === 'build'), 12);
  const quit = weeklySeries(ctx, all.filter((h) => h.kind === 'quit'), 12);
  const hasBQ = build.some((w) => w.t.graded) || quit.some((w) => w.t.graded);

  const days = daysBetween(monthStart(month), monthEnd(month));
  const cells: (MCell | null)[][] = live.map((h) =>
    days.map((d) => {
      const c = cellOf(ctx, h, d);
      if (c === 'na' || c === 'future') return null;
      const color = c === 'unlogged' ? 'var(--line2)' : `var(--${c === 'partial' ? 'partial' : c})`;
      return { bg: color, op: c === 'skip' ? 0.6 : c === 'unlogged' ? 0.6 : 1, title: `${h.name} on ${fmtShort(d)}: ${c === 'unlogged' ? 'not logged' : c}` };
    }),
  );

  return (
    <>
      <Card title="Each habit over six months" sub="Every square is a scheduled day." scope="Last 26 weeks" span={12} empty={live.length ? undefined : 'No habits to show.'}>
        <div className="hcal-grid">
          {live.map((h) => (
            <div key={h.id} className="hcal-item">
              <h4><span aria-hidden>{h.emoji}</span> {h.name}</h4>
              <HabitCal kind={h.kind} weeks={Array.from({ length: 26 }, (_, w) => Array.from({ length: 7 }, (_, r) => { const date = addDays(cal0, w * 7 + r); return { date, cell: cellOf(ctx, h, date) }; }))} />
            </div>
          ))}
        </div>
        <div className="legend calkey">
          {(['done', 'partial', 'missed', 'skip'] as const).map((s) => <span key={s}><i className={'hcc ' + s} />{s === 'skip' ? 'Skipped' : s === 'partial' ? 'Partly' : s[0].toUpperCase() + s.slice(1)}</span>)}
          <span><i className="hcc unlogged" />Not logged</span>
        </div>
      </Card>

      <Card title="Ranking" sub="Completion for the month, best first." scope="Selected month" span={6} empty={live.length ? undefined : 'No habits to rank.'}>
        <Bars rows={rankRows} max={100} />
      </Card>

      <Card title="Streaks" sub="A single miss pauses a run. Two in a row end it." scope="Right now" span={6} empty={live.length ? undefined : 'No habits yet.'}>
        <Bullets rows={streakRows} />
      </Card>

      <Card title="Build against quit" sub="Weekly completion for the habits you are growing and the ones you are dropping." scope="12 weeks, all habits" span={6} empty={hasBQ ? undefined : 'Log a few weeks to compare.'}>
        <LineChart
          labels={build.map((w) => fmtShort(w.start))}
          series={[
            { name: 'Build', color: 'var(--done)', values: build.map((w) => w.t.score), width: 3, dots: true },
            { name: 'Quit', color: 'var(--accent)', values: quit.map((w) => w.t.score), width: 3, dots: true },
          ]}
        />
      </Card>

      <Card title="What triggers a slip" sub="Only the habits you are trying to quit." scope="Last 90 days" span={6} empty={quitRows.length ? undefined : hasQuit ? 'No slips on quit habits in this range.' : 'No quit habits in this view. Switch the filter to All or Quit.'}>
        <Bars rows={quitRows} />
        <div className="legend"><span><i style={{ background: 'var(--missed)' }} />Slipped</span><span><i style={{ background: 'var(--partial)' }} />Partly</span></div>
      </Card>

      <Card title="Habit by day" sub="The month as one sheet, same colours as the grid." scope="Selected month" span={12} empty={live.length ? undefined : 'No habits yet.'}>
        <Matrix compact focusCol={days.includes(today) ? days.indexOf(today) : days.length - 1} lw={150} cw={16} rows={live.map((h) => ({ label: h.name, emoji: h.emoji }))} cols={days.map((d) => String(parse(d).getDate()))} cells={cells} />
      </Card>
    </>
  );
}

/* ═══════════════════════════ Reasons ═══════════════════════════ */
export function ReasonsTab({ ctx, habits, month, from, to }: Scope) {
  const today = ctx.today;
  const cmap = catMap(ctx.cats);
  const live = habits.filter((h) => !h.archived);
  const ents = entries(ctx, habits, from, to);
  const e90 = entries(ctx, habits, from90(ctx), today);
  const have = loggedDays(ctx, habits);
  const label = (id: string) => cmap.get(id)?.label ?? id;
  const color = (id: string) => catColor(cmap.get(id));

  // how much was in my control
  const grp = (id: string) => (id === 'other' ? 'unsorted' : cmap.get(id)?.controllable ? 'ctrl' : 'ext');
  const ctrlPct = ents.length ? ents.filter((e) => grp(e.primary) === 'ctrl').length / ents.length : null;
  const w10 = weeklySeries(ctx, habits, 10).map((w) => {
    const list = entries(ctx, habits, w.start, addDays(w.start, 6));
    return {
      label: String(parse(w.start).getDate()),
      segs: [
        { v: list.filter((e) => grp(e.primary) === 'ctrl').length, color: 'var(--accent)', name: 'in my control' },
        { v: list.filter((e) => grp(e.primary) === 'ext').length, color: 'var(--skip)', name: 'outside my control' },
        { v: list.filter((e) => grp(e.primary) === 'unsorted').length, color: 'var(--faint)', name: 'unsorted' },
      ],
    };
  });

  // donut
  const counts = [...countPrimary(ents).entries()].sort((a, b) => b[1] - a[1]);
  const slices: Slice[] = counts.slice(0, 8).map(([id, v]) => ({ id, label: label(id), value: v, color: color(id), emoji: cmap.get(id)?.emoji }));
  if (counts.length > 8) slices.push({ id: '_rest', label: 'Everything else', value: counts.slice(8).reduce((a, [, v]) => a + v, 0), color: 'var(--other)' });

  // area over 20 weeks
  const w20 = weeklySeries(ctx, habits, 20).map((w) => ({ start: w.start, list: entries(ctx, habits, w.start, addDays(w.start, 6)) }));
  const total20 = new Map<string, number>();
  w20.forEach((w) => w.list.forEach((e) => total20.set(e.primary, (total20.get(e.primary) || 0) + 1)));
  const top6 = [...total20.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => id);
  const areaSeries = [
    ...top6.map((id) => ({ name: label(id), color: color(id), values: w20.map((w) => w.list.filter((e) => e.primary === id).length) })),
    { name: 'Everything else', color: 'var(--other)', values: w20.map((w) => w.list.filter((e) => !top6.includes(e.primary)).length) },
  ].filter((s) => s.values.some((v) => v > 0));

  // reason x habit
  const catsUsed = [...countPrimary(e90).entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id]) => id);
  const mxHabit = Math.max(1, ...catsUsed.flatMap((id) => live.map((h) => e90.filter((e) => e.habit.id === h.id && e.tags.includes(id)).length)));
  const habitCells: (MCell | null)[][] = catsUsed.map((id) =>
    live.map((h) => {
      const n = e90.filter((e) => e.habit.id === h.id && e.tags.includes(id)).length;
      return n ? { bg: 'var(--accent)', op: 0.18 + 0.72 * (n / mxHabit), text: String(n), title: `${label(id)} on ${h.name}: ${n}` } : { bg: 'var(--line)', op: 0.4, title: `${label(id)} on ${h.name}: none` };
    }),
  );

  const splitAll = splitRows(e90, cmap);

  // sankey
  const hCount = new Map<string, number>();
  e90.forEach((e) => hCount.set(e.habit.id, (hCount.get(e.habit.id) || 0) + 1));
  const leftNodes = [...hCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => live.find((h) => h.id === id)).filter(Boolean) as Habit[];
  const rightIds = [...countPrimary(e90).entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id);
  const links: { from: string; to: string; v: number }[] = [];
  leftNodes.forEach((h) => rightIds.forEach((id) => {
    const v = e90.filter((e) => e.habit.id === h.id && e.primary === id).length;
    if (v) links.push({ from: h.id, to: id, v });
  }));

  return (
    <>
      <Card title="How much was in my control" sub="Reasons you can change, against reasons that came from outside. Edit the split in Manage." scope="Month, plus 10 weeks" span={6} empty={ents.length < 3 && w10.every((w) => w.segs.every((s) => s.v === 0)) ? 'Log a few reasons to see this.' : undefined}>
        <div className="ctrl-head">
          <span className="ctrl-big">{ctrlPct === null ? '–' : pct(ctrlPct)}</span>
          <span className="muted">of this month's slips were within your control</span>
        </div>
        <Columns cols={w10} height={140} legend={[{ name: 'In my control', color: 'var(--accent)' }, { name: 'Outside my control', color: 'var(--skip)' }, { name: 'Unsorted', color: 'var(--faint)' }]} />
      </Card>

      <Card title="What gets in the way" sub="Main reason behind each slip or partly done day." scope="Selected month" span={6} empty={slices.length ? undefined : 'No reasons logged in this month yet.'}>
        <Donut slices={slices} centerLabel="reasons logged" />
      </Card>

      <Card title="Reasons over time" sub="Watch a reason grow or shrink week by week." scope="Last 20 weeks" span={12} empty={areaSeries.length ? undefined : 'No reasons logged yet.'}>
        <StackedArea labels={w20.map((w) => fmtShort(w.start))} series={areaSeries} />
      </Card>

      <Card title="Reason by habit" sub="Which habits each reason hits hardest." scope="Last 90 days" span={6} empty={catsUsed.length ? undefined : 'No reasons logged yet.'}>
        <Matrix rows={catsUsed.map((id) => ({ label: label(id), emoji: cmap.get(id)?.emoji }))} cols={live.map((h) => h.emoji)} cells={habitCells} cw={30} lw={136} />
      </Card>

      <Card title="Partly or missed?" sub="Reasons that only dent a habit, against ones that end it." scope="Last 90 days" span={6} empty={e90.length ? undefined : 'No reasons logged yet.'}>
        <Bars rows={splitAll} />
        <div className="legend"><span><i style={{ background: 'var(--missed)' }} />Missed</span><span><i style={{ background: 'var(--partial)' }} />Partly</span></div>
      </Card>

      <Card title="From habit to reason" sub="Follow a habit to see what hits it. Tap a name to focus." scope="Last 90 days" span={12} locked={have < NEED ? { have, need: NEED } : undefined} empty={links.length ? undefined : 'No reasons logged yet.'}>
        <Sankey
          left={leftNodes.map((h) => ({ id: h.id, label: h.name, color: habitColor(h) }))}
          right={rightIds.map((id) => ({ id, label: label(id), color: color(id) }))}
          links={links}
        />
      </Card>
    </>
  );
}

/* ═══════════════════════════ Patterns ═══════════════════════════ */
export function PatternsTab({ ctx, habits, all }: Scope) {
  const today = ctx.today;
  const cmap = catMap(ctx.cats);
  const live = habits.filter((h) => !h.archived);
  const have = loggedDays(ctx, habits);
  const first = live.length ? live.reduce((m, h) => (h.start < m ? h.start : m), live[0].start) : today;

  // correlation
  const cor = correlation(ctx, live, first, today);
  const corCells: (MCell | null)[][] = live.map((_, i) =>
    live.map((__, j) => {
      const r = cor.m[i][j];
      if (i === j) return { bg: 'var(--line2)', op: 0.5, text: '', title: `${live[i].name}` };
      if (r === null) return null;
      const rr = Math.round(r * 100) / 100;
      return { bg: r >= 0 ? 'var(--done)' : 'var(--missed)', op: Math.min(0.9, 0.12 + Math.abs(r) * 1.4), text: rr.toFixed(1).replace('0.', '.').replace('-.', '−.'), title: `${live[i].name} and ${live[j].name}: ${rr.toFixed(2)} (${cor.n[i][j]} shared days)` };
    }),
  );

  // reason x weekday
  const e90 = entries(ctx, habits, from90(ctx), today);
  const catsUsed = [...countPrimary(e90).entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id]) => id);
  const byDay = (id: string) => DOW.map((_, k) => e90.filter((e) => e.tags.includes(id) && (parse(e.date).getDay() + 6) % 7 === k).length);
  const mxDay = Math.max(1, ...catsUsed.flatMap(byDay));
  const dayCells: (MCell | null)[][] = catsUsed.map((id) =>
    byDay(id).map((n, k) => (n ? { bg: 'var(--accent)', op: 0.18 + 0.72 * (n / mxDay), text: String(n), title: `${cmap.get(id)?.label} on ${DOW[k]}s: ${n}` } : { bg: 'var(--line)', op: 0.4, title: `${cmap.get(id)?.label} on ${DOW[k]}s: none` })),
  );

  // radar
  const f90 = from90(ctx);
  const rb = weekdayScores(ctx, habits.filter((h) => h.kind === 'build'), f90, today);
  const rq = weekdayScores(ctx, habits.filter((h) => h.kind === 'quit'), f90, today);
  const radar = [
    ...(habits.some((h) => h.kind === 'build') ? [{ name: 'Build', color: 'var(--done)', values: rb }] : []),
    ...(habits.some((h) => h.kind === 'quit') ? [{ name: 'Quit', color: 'var(--accent)', values: rq }] : []),
  ];
  const hasRadar = radar.some((s) => s.values.some((v) => v !== null));

  // recovery
  const rec = recovery(ctx, live);
  const recCols = ['1 day', '2 days', '3 days', '4 to 5', '6 or more'].map((label, i) => ({
    label, segs: [{ v: rec.buckets[i], color: i < 2 ? 'var(--done)' : i < 4 ? 'var(--partial)' : 'var(--missed)', name: 'misses' }],
  }));

  return (
    <>
      <Card title="Habits that move together" sub="Green pairs tend to be done on the same days. Red pairs compete for you." scope="All history" span={6} locked={have < NEED ? { have, need: NEED } : undefined} empty={live.length < 3 ? 'Needs at least three habits.' : undefined}>
        <Matrix rows={live.map((h) => ({ label: h.name, emoji: h.emoji }))} cols={live.map((h) => h.emoji)} cells={corCells} cw={34} />
      </Card>

      <Card title="Reason by weekday" sub="Which reasons show up on which days." scope="Last 90 days" span={6} empty={catsUsed.length ? undefined : 'No reasons logged yet.'}>
        <Matrix rows={catsUsed.map((id) => ({ label: cmap.get(id)?.label ?? id, emoji: cmap.get(id)?.emoji }))} cols={DOW} cells={dayCells} cw={34} lw={136} />
      </Card>

      <Card title="Best and worst days" sub="Completion by day of the week." scope="Last 90 days" span={6} empty={hasRadar ? undefined : 'Needs a few weeks of logs.'}>
        <Radar axes={DOW} series={radar} />
      </Card>

      <Card title="How fast you bounce back" sub="Logged days it takes to get back to done after a miss." scope="All history" span={6} locked={have < NEED ? { have, need: NEED } : undefined} empty={rec.count + rec.open === 0 ? 'No misses yet, nothing to recover from.' : undefined}>
        <div className="ctrl-head">
          <span className="ctrl-big">{rec.avg === null ? '–' : rec.avg.toFixed(1)}</span>
          <span className="muted">days on average{rec.open ? `, ${rec.open} still open` : ''}</span>
        </div>
        <Columns cols={recCols} height={140} />
      </Card>
    </>
  );
}
