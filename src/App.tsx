import { useEffect, useState } from 'react';
import { MotionConfig, motion } from 'framer-motion';
import { BarChart3, CalendarCheck, Grid3x3, SlidersHorizontal } from 'lucide-react';
import { StoreProvider, useStore } from './lib/store';
import type { EditTarget } from './types';
import { TodayView } from './views/TodayView';
import { GridView } from './views/GridView';
import { InsightsView } from './views/InsightsView';
import { ManageView } from './views/ManageView';
import { LogSheet } from './views/LogSheet';
import { AuthView } from './views/AuthView';
import { SyncPill } from './views/SyncPill';
import type { Cloud } from './lib/cloud';

type View = 'today' | 'grid' | 'insights' | 'manage';
const NAV = [
  { id: 'today' as const, label: 'Today', Icon: CalendarCheck },
  { id: 'grid' as const, label: 'Grid', Icon: Grid3x3 },
  { id: 'insights' as const, label: 'Insights', Icon: BarChart3 },
  { id: 'manage' as const, label: 'Manage', Icon: SlidersHorizontal },
];

function Shell() {
  const { today, mode, auth, ready } = useStore();
  const [view, setView] = useState<View>('today');
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [anchor, setAnchor] = useState(today);

  useEffect(() => {
    try {
      window.scrollTo({ top: 0 });
    } catch {
      /* not available in every environment */
    }
  }, [view]);

  // signing out (or in as someone else) always starts from Today
  useEffect(() => {
    if (auth.status !== 'in') {
      setView('today');
      setEdit(null);
    }
  }, [auth.status]);

  if (mode === 'cloud' && auth.status === 'loading') return <div className="splash"><span className="mark" aria-hidden>✓</span>Loading…</div>;
  if (mode === 'cloud' && auth.status === 'out') return <AuthView />;
  if (mode === 'cloud' && !ready) return <div className="splash"><span className="mark" aria-hidden>✓</span>Loading your habits…</div>;

  return (
    <div className="app">
      <nav className="nav" aria-label="Main">
        <div className="brand">
          <span className="mark" aria-hidden>✓</span>
          <span className="wm">Kaizen</span>
        </div>
        {NAV.map(({ id, label, Icon }) => (
          <button key={id} type="button" className={'nav-i' + (view === id ? ' on' : '')} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>
            <Icon size={20} aria-hidden />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <main className="main">
        <SyncPill />
        <motion.div key={view} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
          {view === 'today' && (
            <TodayView
              onEdit={setEdit}
              onManage={() => setView('manage')}
              onFixDays={(d) => {
                setAnchor(d);
                setView('grid');
              }}
            />
          )}
          {view === 'grid' && <GridView anchor={anchor} setAnchor={setAnchor} onEdit={setEdit} />}
          {view === 'insights' && <InsightsView />}
          {view === 'manage' && <ManageView />}
        </motion.div>
      </main>

      <LogSheet target={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

export default function App({ cloud }: { cloud?: Cloud | null } = {}) {
  return (
    <MotionConfig reducedMotion="user">
      <StoreProvider cloud={cloud}>
        <Shell />
      </StoreProvider>
    </MotionConfig>
  );
}
