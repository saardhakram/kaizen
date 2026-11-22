import { useRef, useState } from 'react';
import { newId } from '../lib/id';
import { useInstall } from '../lib/install';
import { downloadText, toCsv } from '../lib/csv';
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react';
import { Modal, Segmented, Toggle, catColor, cssVars, habitColor } from '../ui';
import { useStore } from '../lib/store';
import { DOW, DOW_ORDER } from '../lib/date';
import type { Category, Habit, Kind, Theme } from '../types';

const EMOJIS = ['🏋️', '📚', '💧', '🧘', '🌙', '📖', '🏃', '🥗', '🧠', '✍️', '🎸', '💊', '🧹', '📵', '🍟', '🚬', '🍺', '🎮', '☕', '🛒'];
const HUES = [24, 48, 100, 140, 178, 205, 250, 285, 335, 8];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function HabitEditor({ habit, onClose }: { habit: Habit | null; onClose: () => void }) {
  const { today, saveHabit } = useStore();
  const [name, setName] = useState(habit?.name ?? '');
  const [emoji, setEmoji] = useState(habit?.emoji ?? EMOJIS[0]);
  const [kind, setKind] = useState<Kind>(habit?.kind ?? 'build');
  const [days, setDays] = useState<number[]>(habit?.days ?? ALL_DAYS);
  const [hue, setHue] = useState(habit?.hue ?? HUES[0]);
  const valid = name.trim().length > 0 && days.length > 0;
  const toggle = (d: number) => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d]);

  return (
    <div className="sheet-in" style={cssVars({ '--c': `hsl(${hue} var(--cat-s) var(--cat-l))` })}>
      <div className="sheet-grab" aria-hidden />
      <header className="sheet-h">
        <span className="tile" aria-hidden>{emoji}</span>
        <div><h2>{habit ? 'Edit habit' : 'New habit'}</h2><p className="muted">{kind === 'quit' ? 'Something you want to stop' : 'Something you want to do'}</p></div>
      </header>

      <label className="field">
        <span className="flabel">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'quit' ? 'No late-night snacks' : 'Read 20 pages'} maxLength={40} />
      </label>

      <div className="field">
        <span className="flabel">Type</span>
        <Segmented<Kind> label="Type" value={kind} onChange={setKind} options={[{ v: 'build', label: 'Build a habit' }, { v: 'quit', label: 'Quit a habit' }]} />
      </div>

      <div className="field">
        <span className="flabel">Icon</span>
        <div className="emoji-grid">
          {EMOJIS.map((e) => <button key={e} type="button" className={e === emoji ? 'on' : ''} aria-label={`Icon ${e}`} aria-pressed={e === emoji} onClick={() => setEmoji(e)}>{e}</button>)}
        </div>
      </div>

      <div className="field">
        <span className="flabel">Colour</span>
        <div className="hue-row">
          {HUES.map((h) => <button key={h} type="button" className={h === hue ? 'on' : ''} aria-label={`Colour ${h}`} aria-pressed={h === hue} style={{ background: `hsl(${h} var(--cat-s) var(--cat-l))` }} onClick={() => setHue(h)} />)}
        </div>
      </div>

      <div className="field">
        <span className="flabel">Schedule</span>
        <div className="days-row">
          {DOW_ORDER.map((d, i) => <button key={d} type="button" className={days.includes(d) ? 'on' : ''} aria-pressed={days.includes(d)} onClick={() => toggle(d)}>{DOW[i]}</button>)}
        </div>
        <div className="presets">
          <button type="button" className="btn quiet sm" onClick={() => setDays(ALL_DAYS)}>Every day</button>
          <button type="button" className="btn quiet sm" onClick={() => setDays([1, 2, 3, 4, 5])}>Weekdays</button>
          <button type="button" className="btn quiet sm" onClick={() => setDays([0, 6])}>Weekends</button>
        </div>
      </div>

      <footer className="sheet-f">
        <span className="grow" />
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" disabled={!valid} onClick={() => {
          saveHabit({ id: habit?.id ?? newId(), name: name.trim(), emoji, kind, hue, days, start: habit?.start ?? today, archived: habit?.archived });
          onClose();
        }}>Save habit</button>
      </footer>
    </div>
  );
}

function Categories() {
  const { state, setCats, retag } = useStore();
  const [label, setLabel] = useState('');
  const [kw, setKw] = useState('');
  const [ctrl, setCtrl] = useState(true);
  const [done, setDone] = useState(false);
  const update = (id: string, patch: Partial<Category>) => setCats(state.cats.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const add = () => {
    if (!label.trim()) return;
    const used = new Set(state.cats.map((c) => c.hue));
    const hue = [12, 60, 120, 155, 200, 230, 275, 310, 340].find((h) => !used.has(h)) ?? 200;
    setCats([...state.cats.filter((c) => c.id !== 'other'), { id: 'c_' + Date.now().toString(36), label: label.trim(), emoji: '🏷️', hue, controllable: ctrl, keywords: kw.split(',').map((k) => k.trim()).filter(Boolean), custom: true }, ...state.cats.filter((c) => c.id === 'other')]);
    setLabel(''); setKw(''); setCtrl(true);
  };

  return (
    <section className="panel wide">
      <h2>Reasons</h2>
      <p className="muted">Every missed or partly done habit gets tagged with one or more of these. Mark the ones that are in your control so the review can show how much you could change.</p>
      <ul className="catlist">
        <li className="cathead"><span>Reason</span><span>Words it looks for</span><span>In my control</span><span /></li>
        {state.cats.map((c) => (
          <li key={c.id} style={cssVars({ '--c': catColor(c) })}>
            <span className="catname"><i className="cdot" />{c.emoji} {c.label}</span>
            <input aria-label={`Words for ${c.label}`} key={c.keywords.join(',')} defaultValue={c.keywords.join(', ')} disabled={c.id === 'other'} placeholder={c.id === 'other' ? 'Catches everything else' : 'comma, separated'} onBlur={(e) => update(c.id, { keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })} />
            <Toggle on={c.controllable} onChange={(v) => update(c.id, { controllable: v })} label={`${c.label} is in my control`} />
            {c.custom ? <button type="button" className="icon-btn" aria-label={`Delete ${c.label}`} onClick={() => setCats(state.cats.filter((x) => x.id !== c.id))}><Trash2 size={16} /></button> : <span />}
          </li>
        ))}
      </ul>
      <div className="addcat">
        <input aria-label="New reason name" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="New reason, like Hostel noise" maxLength={30} />
        <input aria-label="Words for the new reason" value={kw} onChange={(e) => setKw(e.target.value)} placeholder="Words it looks for, comma separated" />
        <label className="inline"><Toggle on={ctrl} onChange={setCtrl} label="In my control" /> In my control</label>
        <button type="button" className="btn primary sm" disabled={!label.trim()} onClick={add}><Plus size={15} aria-hidden /> Add reason</button>
      </div>
      <div className="retag">
        <button type="button" className="btn ghost sm" onClick={() => { retag(); setDone(true); setTimeout(() => setDone(false), 2500); }}>Re-tag past entries</button>
        <span className="muted" aria-live="polite">{done ? 'Done. Past reasons now use your latest words and categories.' : 'Run this after changing words or adding a reason.'}</span>
      </div>
    </section>
  );
}

export function ManageView() {
  const { state, today, mode, auth, sync, signOut, archiveHabit, setTheme, setDayEnds, loadSample, startFresh } = useStore();
  const PREVIEW = import.meta.env.MODE === 'preview';
  const install = useInstall();
  const [editing, setEditing] = useState<Habit | 'new' | null>(null);
  const [confirm, setConfirm] = useState<'sample' | 'fresh' | null>(null);
  const lastEditing = useRef<Habit | 'new' | null>(null);
  if (editing !== null) lastEditing.current = editing;
  const shown = editing ?? lastEditing.current;
  const active = state.habits.filter((h) => !h.archived);
  const archived = state.habits.filter((h) => h.archived);
  const sched = (h: Habit) => (h.days.length === 7 ? 'Every day' : h.days.length === 5 && [1, 2, 3, 4, 5].every((d) => h.days.includes(d)) ? 'Weekdays' : DOW_ORDER.filter((d) => h.days.includes(d)).map((d) => DOW[DOW_ORDER.indexOf(d)]).join(' '));

  const row = (h: Habit) => (
    <li key={h.id} style={cssVars({ '--c': habitColor(h) })} className={h.archived ? 'arch' : ''}>
      <span className="tile sm" aria-hidden>{h.emoji}</span>
      <span className="hname">{h.name}<span className="muted"> {h.kind === 'quit' ? 'Quit' : 'Build'}, {sched(h)}</span></span>
      <button type="button" className="icon-btn" aria-label={`Edit ${h.name}`} onClick={() => setEditing(h)}><Pencil size={16} /></button>
      <button type="button" className="icon-btn" aria-label={h.archived ? `Restore ${h.name}` : `Archive ${h.name}`} onClick={() => archiveHabit(h.id, !h.archived)}>{h.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}</button>
    </li>
  );

  return (
    <div className="manage">
      <header className="page-h">
        <div>
          <h1 className="display">Manage</h1>
          <p className="lede">Habits, the reasons you tag, and how the app behaves.</p>
        </div>
      </header>

      {mode === 'cloud' && (
        <section className="panel wide">
          <h2>Account</h2>
          <div className="setrow">
            <div>
              <strong>{auth.email}</strong>
              <p className="muted" aria-live="polite">
                {sync.error ?? (!sync.online ? 'Offline. Changes are kept on this device and sync when you reconnect.' : sync.pending > 0 ? `${sync.pending} ${sync.pending === 1 ? 'change' : 'changes'} waiting to sync.` : sync.lastSynced ? 'All changes saved.' : 'Connecting…')}
              </p>
            </div>
            <button type="button" className="btn ghost sm" onClick={() => void signOut()}>Sign out</button>
          </div>
        </section>
      )}

      <section className="panel wide">
        <div className="panel-h"><h2>Habits</h2><button type="button" className="btn primary sm" onClick={() => setEditing('new')}><Plus size={15} aria-hidden /> New habit</button></div>
        {active.length === 0 ? <p className="muted">No habits yet. Add one to start logging.</p> : <ul className="hlist">{active.map(row)}</ul>}
        {archived.length > 0 && (
          <>
            <h3 className="sub-h">Archived</h3>
            <p className="muted">Archived habits leave Today and the grid, but their history stays in your graphs.</p>
            <ul className="hlist">{archived.map(row)}</ul>
          </>
        )}
      </section>

      <Categories />

      <section className="panel wide">
        <h2>Settings</h2>
        <div className="setrow">
          <div><strong>Theme</strong><p className="muted">Auto follows your device.</p></div>
          <Segmented<Theme> label="Theme" value={state.theme} onChange={setTheme} options={[{ v: 'auto', label: 'Auto' }, { v: 'dark', label: 'Dark' }, { v: 'light', label: 'Light' }]} />
        </div>
        <div className="setrow">
          <div><strong>My day ends at</strong><p className="muted">Logging after midnight still counts for the day before, until this hour.</p></div>
          <label className="select">
            <span className="sr">Day ends at</span>
            <select value={state.dayEnds} onChange={(e) => setDayEnds(Number(e.target.value))}>
              {[0, 1, 2, 3, 4, 5, 6].map((h) => <option key={h} value={h}>{h === 0 ? '12 AM (midnight)' : `${h} AM`}</option>)}
            </select>
          </label>
        </div>
        {install && (
          <div className="setrow">
            <div><strong>Install app</strong><p className="muted">Adds Kaizen to your home screen or desktop and opens it in its own window, even without a connection.</p></div>
            <button type="button" className="btn ghost sm" onClick={() => void install()}>Install</button>
          </div>
        )}
        {!PREVIEW && (
          <div className="setrow">
            <div><strong>Export</strong><p className="muted">Every logged day with its reason, as a spreadsheet for Excel or Google Sheets.</p></div>
            <button type="button" className="btn ghost sm" onClick={() => downloadText(`kaizen-${today}.csv`, toCsv(state))}>Download CSV</button>
          </div>
        )}
        {mode === 'local' && (
        <div className="setrow">
          <div><strong>Sample data</strong><p className="muted">{state.sample ? 'You are looking at made-up data: five months of history for eight habits.' : 'You are on an empty sheet. Graphs unlock as you log.'}</p></div>
          <div className="btnrow">
            <button type="button" className={'btn ghost sm' + (confirm === 'sample' ? ' warn' : '')} onClick={() => { if (confirm === 'sample') { loadSample(); setConfirm(null); } else setConfirm('sample'); }}>{confirm === 'sample' ? 'Tap again to replace everything' : 'Load sample data'}</button>
            <button type="button" className={'btn ghost sm' + (confirm === 'fresh' ? ' warn' : '')} onClick={() => { if (confirm === 'fresh') { startFresh(); setConfirm(null); } else setConfirm('fresh'); }}>{confirm === 'fresh' ? 'Tap again to erase everything' : 'Start empty'}</button>
          </div>
        </div>
        )}
      </section>

      <p className="foot muted">
        {mode === 'cloud'
          ? 'Your habits and check-ins sync to your own database, so your laptop and phone always show the same thing. Reasons are still tagged by keyword matching, and the monthly summary is still written by rules; real AI comes in the next phase.'
          : 'Preview build. Everything is saved only in this browser. Reasons are tagged by keyword matching and the monthly summary is written by rules; real AI tagging, accounts that sync your phone and laptop, and the Android app come in the next phases.'}
      </p>

      <Modal open={editing !== null} onClose={() => setEditing(null)} label={editing === 'new' ? 'New habit' : 'Edit habit'}>
        {shown !== null && <HabitEditor key={shown === 'new' ? 'new' : shown.id} habit={shown === 'new' ? null : shown} onClose={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
