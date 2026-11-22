import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Segmented, StatusIcon, cssVars, habitColor, pct, useMedia } from '../ui';
import { useStore } from '../lib/store';
import { addDays, addMonths, daysBetween, DOW, dowMon, monthEnd, monthLabel, monthOf, monthStart, weekStart, fmtShort, parse } from '../lib/date';
import { cellOf, tally, type Cell } from '../lib/stats';
import { LABELS, type EditTarget, type Habit } from '../types';

type Mode = 'week' | 'month';

export function GridView({ anchor, setAnchor, onEdit }: { anchor: string; setAnchor: (d: string) => void; onEdit: (t: EditTarget) => void }) {
  const { state, ctx, today } = useStore();
  const narrow = useMedia('(max-width: 760px)');
  const [pick, setPick] = useState<Mode | null>(null);
  const mode: Mode = pick ?? (narrow ? 'week' : 'month');
  const scroller = useRef<HTMLDivElement>(null);

  const dates = mode === 'week'
    ? daysBetween(weekStart(anchor), addDays(weekStart(anchor), 6))
    : daysBetween(monthStart(monthOf(anchor)), monthEnd(monthOf(anchor)));
  const title = mode === 'week' ? `${fmtShort(dates[0])} to ${fmtShort(dates[6])}` : monthLabel(monthOf(anchor));
  const move = (dir: 1 | -1) => setAnchor(mode === 'week' ? addDays(anchor, 7 * dir) : monthStart(addMonths(monthOf(anchor), dir)));

  const habits = state.habits.filter((h) => !h.archived);
  const build = habits.filter((h) => h.kind === 'build');
  const quit = habits.filter((h) => h.kind === 'quit');
  const from = dates[0];
  const to = dates[dates.length - 1];

  // keep today's column in view on month view
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const el = box.querySelector<HTMLElement>('.gh.today');
    if (el && box.scrollWidth > box.clientWidth) box.scrollLeft = Math.max(0, el.offsetLeft - box.clientWidth * 0.6);
    else box.scrollLeft = 0;
  }, [mode, anchor]);

  const cw = mode === 'week' ? (narrow ? 'minmax(26px, 1fr)' : 'minmax(40px, 1fr)') : 'minmax(22px, 1fr)';
  const cols = { gridTemplateColumns: `var(--lw) repeat(${dates.length}, ${cw}) var(--rw)` };

  const cell = (h: Habit, d: string) => {
    const c: Cell = cellOf(ctx, h, d);
    const clickable = c !== 'na' && c !== 'future';
    const label = `${h.name}, ${d}: ${c === 'na' ? 'not scheduled' : c === 'future' ? 'upcoming' : c === 'unlogged' ? 'not logged' : LABELS[h.kind][c]}`;
    return (
      <button key={d} type="button" className={'gc ' + c + (d === today ? ' today' : '')} disabled={!clickable} aria-label={label} title={label}
        onClick={() => onEdit({ habitId: h.id, date: d })}>
        {c === 'done' || c === 'partial' || c === 'missed' || c === 'skip' ? <StatusIcon s={c} size={mode === 'week' ? 18 : 14} /> : null}
      </button>
    );
  };

  const block = (name: string, hs: Habit[]) =>
    hs.length > 0 && (
      <>
        <div className="grow-h" style={cols}>
          <div className="gl-cell group">{name}</div>
        </div>
        {hs.map((h) => {
          const t = tally(ctx, [h], from, to);
          return (
            <div className="grw" style={{ ...cols, ...cssVars({ '--c': habitColor(h) }) }} key={h.id} role="row">
              <div className="gl-cell name" role="rowheader"><span className="tile sm" aria-hidden>{h.emoji}</span><span className="gname">{h.name}</span></div>
              {dates.map((d) => cell(h, d))}
              <div className="gr-cell" title="Completion in this range">{pct(t.score)}</div>
            </div>
          );
        })}
      </>
    );

  return (
    <div className="gridview">
      <header className="page-h">
        <div>
          <h1 className="display">Grid</h1>
          <p className="lede">Tap any cell to log or fix a day. Reasons are required for partly and missed.</p>
        </div>
      </header>

      <div className="gtools">
        <div className="pager">
          <button type="button" className="icon-btn" onClick={() => move(-1)} aria-label="Previous"><ChevronLeft size={18} /></button>
          <strong className="ptitle">{title}</strong>
          <button type="button" className="icon-btn" onClick={() => move(1)} aria-label="Next"><ChevronRight size={18} /></button>
          <button type="button" className="btn ghost sm" onClick={() => setAnchor(today)}>Today</button>
        </div>
        <Segmented<Mode> label="Range" value={mode} onChange={setPick} options={[{ v: 'week', label: 'Week' }, { v: 'month', label: 'Month' }]} />
      </div>

      {habits.length === 0 ? (
        <div className="empty big"><h2>The grid fills in as you log</h2><p>Add habits in Manage, or load the sample data.</p></div>
      ) : (
        <div className="sheetbox" ref={scroller}>
          <div className={'gtable ' + mode} role="table" aria-label="Habit grid" style={cssVars({ '--lw': narrow ? '100px' : '188px', '--rw': narrow ? '44px' : '52px' })}>
            <div className="ghead" style={cols} role="row">
              <div className="gl-cell corner" />
              {dates.map((d) => (
                <div key={d} className={'gh' + (d === today ? ' today' : '') + (d > today ? ' fut' : '')}>
                  <span className="gh-w">{DOW[dowMon(d)].slice(0, mode === 'week' ? 3 : 1)}</span>
                  <span className="gh-d">{parse(d).getDate()}</span>
                </div>
              ))}
              <div className="gr-cell head">Score</div>
            </div>
            {block('Build', build)}
            {block('Quit', quit)}
            <div className="gfoot" style={cols}>
              <div className="gl-cell name"><span className="gname">Day score</span></div>
              {dates.map((d) => {
                const s = tally(ctx, habits, d, d).score;
                return (
                  <div key={d} className="gf" title={s === null ? 'Nothing logged' : `${Math.round(s * 100)}%`}>
                    <i style={{ height: s === null ? 0 : `${Math.max(6, s * 100)}%` }} />
                    {mode === 'week' && <span>{s === null ? '' : Math.round(s * 100)}</span>}
                  </div>
                );
              })}
              <div className="gr-cell head">{pct(tally(ctx, habits, from, to).score)}</div>
            </div>
          </div>
        </div>
      )}
      <div className="gkey">
        {(['done', 'partial', 'missed', 'skip'] as const).map((s) => (
          <span key={s} className={'gk ' + s}><i><StatusIcon s={s} size={12} /></i>{s === 'skip' ? 'Skipped' : LABELS.build[s]}</span>
        ))}
        <span className="gk unlogged"><i />Not logged</span>
        <span className="gk na"><i />Not scheduled</span>
      </div>
    </div>
  );
}
