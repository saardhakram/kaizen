import { useMemo, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Modal, StatusIcon, catColor, cssVars, statusVar } from '../ui';
import { useStore } from '../lib/store';
import { detect, uniq } from '../lib/tagger';
import { fmtDay } from '../lib/date';
import { LABELS, lk, type EditTarget, type Habit, type Status } from '../types';

const ORDER: Status[] = ['done', 'partial', 'missed', 'skip'];

export function LogSheet({ target, onClose }: { target: EditTarget | null; onClose: () => void }) {
  const { state } = useStore();
  const last = useRef<EditTarget | null>(target);
  if (target) last.current = target;
  const t = target ?? last.current;
  const habit = t ? state.habits.find((h) => h.id === t.habitId) : undefined;
  return (
    <Modal open={!!target && !!habit} onClose={onClose} label="Log a habit">
      {t && habit && <SheetBody key={t.habitId + t.date} habit={habit} date={t.date} initial={t.status} onClose={onClose} />}
    </Modal>
  );
}

function SheetBody({ habit, date, initial, onClose }: { habit: Habit; date: string; initial?: Status; onClose: () => void }) {
  const { state, today, setLog } = useStore();
  const existing = state.logs[lk(habit.id, date)];
  const [status, setStatus] = useState<Status | null>(initial ?? existing?.status ?? null);
  const [text, setText] = useState(existing?.reason ?? '');
  const [manual, setManual] = useState<string[]>(existing?.manual ?? []);
  const [removed, setRemoved] = useState<string[]>([]);
  const [more, setMore] = useState(false);
  const cats = state.cats;
  const needsReason = status === 'partial' || status === 'missed';

  const auto = useMemo(() => detect(text, cats), [text, cats]);
  const tags = uniq([...manual, ...auto.filter((a) => !removed.includes(a))]);

  const sorted = useMemo(() => {
    const kindOf = new Map(state.habits.map((h) => [h.id, h.kind]));
    const use = new Map<string, number>();
    for (const [k, l] of Object.entries(state.logs)) {
      if (kindOf.get(k.split('|')[1]) !== habit.kind) continue;
      l.tags?.forEach((x) => use.set(x, (use.get(x) || 0) + 1));
    }
    return [...cats].sort((a, b) => (use.get(b.id) || 0) - (use.get(a.id) || 0) || cats.indexOf(a) - cats.indexOf(b));
  }, [cats, state.habits, state.logs, habit.kind]);
  const top = new Set(sorted.slice(0, 6).map((c) => c.id));
  const chips = more ? sorted : sorted.filter((c) => top.has(c.id) || tags.includes(c.id));

  const toggle = (id: string) => {
    if (tags.includes(id)) {
      setManual(manual.filter((m) => m !== id));
      if (auto.includes(id)) setRemoved([...removed, id]);
    } else {
      setManual([...manual, id]);
      setRemoved(removed.filter((r) => r !== id));
    }
  };

  const valid = status !== null && (!needsReason || tags.length > 0 || text.trim().length > 0);
  const save = () => {
    if (!status || !valid) return;
    if (needsReason) setLog(habit.id, date, { status, reason: text.trim() || undefined, tags: tags.length ? tags : ['other'], manual: manual.length ? manual : undefined });
    else setLog(habit.id, date, { status });
    onClose();
  };

  const labels = LABELS[habit.kind];
  const question = habit.kind === 'quit' ? 'What triggered it?' : 'What got in the way?';

  return (
    <div className="sheet-in" style={cssVars({ '--c': `hsl(${habit.hue} var(--cat-s) var(--cat-l))` })}>
      <div className="sheet-grab" aria-hidden />
      <header className="sheet-h">
        <span className="tile" aria-hidden>{habit.emoji}</span>
        <div>
          <h2>{habit.name}</h2>
          <p className="muted">{date === today ? 'Today' : fmtDay(date)}</p>
        </div>
      </header>

      <div className="stat-pick" role="group" aria-label="How did it go?">
        {ORDER.map((s) => (
          <button key={s} type="button" className={'sp ' + s + (status === s ? ' on' : '')} aria-pressed={status === s} style={cssVars({ '--s': statusVar[s] })} onClick={() => setStatus(s)}>
            <StatusIcon s={s} size={20} />
            <span>{labels[s]}</span>
          </button>
        ))}
      </div>

      {needsReason && (
        <div className="reason">
          <h3>{question}</h3>
          <div className="chips" role="group" aria-label="Reason categories">
            {chips.map((c) => {
              const on = tags.includes(c.id);
              return (
                <button key={c.id} type="button" className={'chip' + (on ? ' on' : '')} aria-pressed={on} style={cssVars({ '--c': catColor(c) })} onClick={() => toggle(c.id)}>
                  <span aria-hidden>{c.emoji}</span>
                  {c.label}
                  {on && auto.includes(c.id) && !manual.includes(c.id) && <Sparkles size={12} aria-label="picked up from your words" />}
                </button>
              );
            })}
            {!more && sorted.length > chips.length && (
              <button type="button" className="chip ghost" onClick={() => setMore(true)}>
                More
              </button>
            )}
          </div>
          <label className="field">
            <span className="sr">Reason in your own words</span>
            <textarea rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Say it in your own words, like: DBMS exam tomorrow and honestly not in the mood" />
          </label>
          <p className="hint">
            {tags.length ? 'Tags for this entry are set. Tap a tag to add or remove it.' : 'Pick a tag or write a line. Tags are picked up from your words.'}
          </p>
        </div>
      )}

      <footer className="sheet-f">
        {existing && (
          <button type="button" className="btn quiet" onClick={() => { setLog(habit.id, date, null); onClose(); }}>
            Clear entry
          </button>
        )}
        <span className="grow" />
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" disabled={!valid} onClick={save}>Save entry</button>
      </footer>
    </div>
  );
}
