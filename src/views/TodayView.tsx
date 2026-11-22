import { memo, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { CalendarClock, Flame, MoreHorizontal } from 'lucide-react';
import { Ring, Columns } from '../charts';
import { StatusIcon, catColor, cssVars, habitColor, statusVar } from '../ui';
import { useStore } from '../lib/store';
import { addDays, daysBetween, fmtDay, fmtLong } from '../lib/date';
import { cellOf, scheduled, streaks, tally, unloggedDays, type Cell } from '../lib/stats';
import { LABELS, lk, type Category, type EditTarget, type Habit, type Log, type Status } from '../types';
import { LEGEND_STATUS, last7Cols } from './derive';

const BTN: Status[] = ['done', 'partial', 'missed'];

function fire() {
  let canvas: HTMLCanvasElement | null = null;
  try {
    // own canvas, no background worker: works even where blob workers are blocked
    canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:200';
    document.body.appendChild(canvas);
    const el = canvas;
    const shoot = confetti.create(el, { resize: true, useWorker: false });
    Promise.resolve(shoot({ particleCount: 150, spread: 84, startVelocity: 42, origin: { y: 0.3 }, colors: ['#3ddc97', '#ff5fa2', '#ffc24a', '#eaf1ff'], disableForReducedMotion: true })).finally(() => el.remove());
  } catch {
    canvas?.remove(); // confetti is decoration only; never leave debris behind
  }
}

interface RowProps {
  habit: Habit;
  log?: Log;
  recent: Cell[];
  streak: { current: number; longest: number; atRisk: boolean };
  cats: Category[];
  onSet: (s: Status) => void;
  onMore: () => void;
}

const Row = memo(function Row({ habit, log, recent, streak, cats, onSet, onMore }: RowProps) {
  const labels = LABELS[habit.kind];
  const tags = (log?.tags || []).map((t) => cats.find((c) => c.id === t)).filter(Boolean) as Category[];
  return (
    <li className={'lrow' + (log ? ' ' + log.status : '')} style={cssVars({ '--c': habitColor(habit) })}>
      <span className="lbar" aria-hidden />
      <div className="lmain">
        <span className="tile" aria-hidden>{habit.emoji}</span>
        <div className="ltext">
          <div className="lname">{habit.name}</div>
          <div className="lmeta">
            {streak.current >= 2 && (
              <span className="pill flame" title="Current run (never miss twice)">
                <Flame size={13} aria-hidden /> {streak.current}
              </span>
            )}
            {streak.atRisk && !log && <span className="pill warn">Don't miss twice</span>}
            <span className="dots" aria-label="Last seven days">
              {recent.map((c, i) => <i key={i} className={'dot ' + c} />)}
            </span>
          </div>
        </div>
      </div>
      <div className="lact">
        <div className="sbtns" role="group" aria-label={`Log ${habit.name}`}>
          {BTN.map((s) => {
            const on = log?.status === s;
            return (
              <motion.button key={s} type="button" className={'sbtn ' + s + (on ? ' on' : '')} aria-pressed={on} style={cssVars({ '--s': statusVar[s] })} whileTap={{ scale: 0.92 }} onClick={() => onSet(s)}>
                <motion.span key={String(on)} className="sico" initial={on ? { scale: 1.7, rotate: -14, opacity: 0 } : false} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 520, damping: 22 }}>
                  <StatusIcon s={s} size={17} />
                </motion.span>
                <span className="slab">{labels[s]}</span>
              </motion.button>
            );
          })}
        </div>
        <button type="button" className="kebab" onClick={onMore} aria-label={`More options for ${habit.name}`}>
          <MoreHorizontal size={18} />
        </button>
      </div>
      {log && (log.status === 'partial' || log.status === 'missed') && (
        <div className="lreason">
          {log.reason && <span className="quote">{log.reason}</span>}
          <span className="tagrow">
            {tags.map((t) => (
              <span key={t.id} className="tag" style={cssVars({ '--c': catColor(t) })}>{t.label}</span>
            ))}
          </span>
        </div>
      )}
      {log?.status === 'skip' && <span className="skiptag">Skipped</span>}
    </li>
  );
});

export function TodayView({ onEdit, onFixDays, onManage }: { onEdit: (t: EditTarget) => void; onFixDays: (date: string) => void; onManage: () => void }) {
  const { state, ctx, today, setLog } = useStore();
  const active = state.habits.filter((h) => !h.archived);
  const todays = active.filter((h) => scheduled(h, today));
  const rest = active.filter((h) => !scheduled(h, today));
  const t = tally(ctx, todays, today, today);

  const streakMap = useMemo(() => new Map(state.habits.filter((h) => !h.archived).map((h) => [h.id, streaks(ctx, h)])), [ctx, state.habits]);
  const missing = useMemo(() => unloggedDays(ctx, state.habits), [ctx, state.habits]);
  const week = useMemo(() => last7Cols(ctx, active), [ctx]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = todays.length;
  const graded = n - t.skip;
  const value = graded > 0 ? (t.done + 0.5 * t.partial) / graded : 0;
  const logged = t.done + t.partial + t.missed + t.skip;
  const perfect = n > 0 && t.done > 0 && t.done + t.skip === n;
  const prev = useRef(perfect);
  useEffect(() => {
    if (perfect && !prev.current) fire();
    prev.current = perfect;
  }, [perfect]);

  const set = (h: Habit, s: Status) => {
    const cur = ctx.logs[lk(h.id, today)];
    if (s === 'done') setLog(h.id, today, cur?.status === 'done' ? null : { status: 'done' });
    else onEdit({ habitId: h.id, date: today, status: s });
  };

  const summary = active.length === 0
    ? 'Add your first habit to start logging.'
    : n === 0
    ? 'Nothing is scheduled today. Enjoy the rest day.'
    : perfect
      ? 'Perfect day. Every habit ticked.'
      : logged === 0
        ? 'Nothing logged yet. Start with the easiest one.'
        : logged === n
          ? `Day closed: ${t.done} done, ${t.partial} partly, ${t.missed} missed.`
          : `${n - logged} of ${n} still to log.`;

  const build = todays.filter((h) => h.kind === 'build');
  const quit = todays.filter((h) => h.kind === 'quit');
  const recent = (h: Habit) => daysBetween(addDays(today, -6), today).map((d) => cellOf(ctx, h, d));

  const list = (title: string, sub: string, hs: Habit[]) =>
    hs.length > 0 && (
      <section className="lgroup" aria-label={title}>
        <h2 className="lgroup-h">{title}<span className="muted">{sub}</span></h2>
        <ul className="ledger">
          {hs.map((h) => (
            <Row key={h.id} habit={h} log={state.logs[lk(h.id, today)]} recent={recent(h)} streak={streakMap.get(h.id) as { current: number; longest: number; atRisk: boolean }} cats={state.cats}
              onSet={(s) => set(h, s)} onMore={() => onEdit({ habitId: h.id, date: today })} />
          ))}
        </ul>
      </section>
    );

  const atRisk = todays.filter((h) => streakMap.get(h.id)?.atRisk && !state.logs[lk(h.id, today)]);

  return (
    <div className="today" style={cssVars({ '--p': value })}>
      <header className="today-h">
        <div className="today-t">
          <h1 className="display">{fmtLong(today)}</h1>
          <p className="lede">{summary}</p>
        </div>
        <Ring value={value} inner={n ? logged / n : 0} size={148} stroke={15} big={n ? Math.round(value * 100) + '%' : '–'} small={n ? `${t.done} of ${n} done` : active.length ? 'rest day' : 'no habits'} label={`Today: ${Math.round(value * 100)} percent complete, ${logged} of ${n} logged`} />
      </header>

      {missing.length > 0 && (
        <button type="button" className="banner" onClick={() => onFixDays(missing[0])}>
          <CalendarClock size={18} aria-hidden />
          <span>
            <strong>{missing.length === 1 ? '1 day is' : `${missing.length} days are`} not logged.</strong>{' '}
            {missing.slice(0, 3).map(fmtDay).join(', ')}{missing.length > 3 ? ' and more' : ''}
          </span>
          <span className="banner-go">Backfill</span>
        </button>
      )}

      <div className="today-cols">
        <div className="today-main">
          {state.habits.length === 0 && (
            <div className="empty big">
              <h2>No habits yet</h2>
              <p>Add the habits you want to build or quit, then log them here every day.</p>
              <button type="button" className="btn primary" onClick={onManage}>Add a habit</button>
            </div>
          )}
          {list('Build', 'habits to grow', build)}
          {list('Quit', 'habits to drop', quit)}
          {rest.length > 0 && (
            <p className="restline">
              Not scheduled today: {rest.map((h) => `${h.emoji} ${h.name}`).join(', ')}
            </p>
          )}
        </div>
        <aside className="today-side">
          {atRisk.length > 0 && (
            <section className="panel risk">
              <h3>Don't miss twice</h3>
              <p>One miss is fine. These are waiting after a miss:</p>
              <ul>{atRisk.map((h) => <li key={h.id}>{h.emoji} {h.name}</li>)}</ul>
            </section>
          )}
          {active.length > 0 && (
            <section className="panel">
              <h3>Last 7 days</h3>
              <Columns cols={week} height={130} legend={LEGEND_STATUS} />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
