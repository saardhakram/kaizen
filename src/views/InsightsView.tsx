import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Segmented } from '../ui';
import { useStore } from '../lib/store';
import { addMonths, minKey, monthEnd, monthLabel, monthOf, monthStart } from '../lib/date';
import { applyFilter, type Filter } from '../lib/stats';
import { ReviewCard } from './ReviewCard';
import { HabitsTab, OverviewTab, PatternsTab, ReasonsTab, type Scope } from './InsightTabs';

type Tab = 'overview' | 'habits' | 'reasons' | 'patterns';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'habits', label: 'Habits' },
  { id: 'reasons', label: 'Reasons' },
  { id: 'patterns', label: 'Patterns' },
];

export function InsightsView() {
  const { state, ctx, today } = useStore();
  const [month, setMonth] = useState(monthOf(today));
  const [tab, setTab] = useState<Tab>('overview');
  const [f, setF] = useState<Filter>({ kind: 'all', habit: 'all' });

  const habits = useMemo(() => applyFilter(state.habits, f), [state.habits, f]);
  const scope: Scope = {
    ctx, habits, all: state.habits, month,
    from: monthStart(month),
    to: minKey(monthEnd(month), today),
  };
  const canNext = addMonths(month, 1) <= monthOf(today);
  const pickable = state.habits.filter((h) => !h.archived && (f.kind === 'all' || h.kind === f.kind));

  return (
    <div className="insights">
      <header className="page-h">
        <div>
          <h1 className="display">Insights</h1>
          <div className="pager">
            <button type="button" className="icon-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month"><ChevronLeft size={18} /></button>
            <strong className="ptitle">{monthLabel(month)}</strong>
            <button type="button" className="icon-btn" disabled={!canNext} onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month"><ChevronRight size={18} /></button>
          </div>
        </div>
        <div className="filters">
          <Segmented<Filter['kind']> label="Habit type" value={f.kind} onChange={(kind) => setF({ kind, habit: 'all' })} options={[{ v: 'all', label: 'All' }, { v: 'build', label: 'Build' }, { v: 'quit', label: 'Quit' }]} />
          <label className="select">
            <span className="sr">Habit</span>
            <select value={f.habit} onChange={(e) => setF({ ...f, habit: e.target.value })}>
              <option value="all">All habits</option>
              {pickable.map((h) => <option key={h.id} value={h.id}>{h.emoji} {h.name}</option>)}
            </select>
          </label>
        </div>
      </header>

      <ReviewCard month={month} />

      <div className="tabs" role="tablist" aria-label="Insight groups">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
            {tab === t.id && <motion.i layoutId="tabline" className="tabline" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
          </button>
        ))}
      </div>

      <div className="cards" role="tabpanel">
        {tab === 'overview' && <OverviewTab {...scope} />}
        {tab === 'habits' && <HabitsTab {...scope} />}
        {tab === 'reasons' && <ReasonsTab {...scope} />}
        {tab === 'patterns' && <PatternsTab {...scope} />}
      </div>
    </div>
  );
}
