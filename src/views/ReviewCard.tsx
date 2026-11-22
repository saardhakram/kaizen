import { useMemo } from 'react';
import { Info } from 'lucide-react';
import { buildReview } from '../lib/stats';
import { addMonths, monthLabel, monthName } from '../lib/date';
import { useStore } from '../lib/store';
import { pct } from '../ui';

export function ReviewCard({ month }: { month: string }) {
  const { ctx, state, setFocus } = useStore();
  const r = useMemo(() => buildReview(ctx, month), [ctx, month]);
  const picked = state.focus[month] || [];

  if (!r)
    return (
      <section className="review empty-review">
        <h2 className="display">{monthLabel(month)}</h2>
        <p className="lede">Nothing to review yet for {monthName(month)}. Once a few days are logged, the review appears here with the score, the reasons behind your slips and three things to try.</p>
      </section>
    );

  const toggle = (id: string) => {
    if (picked.includes(id)) setFocus(month, picked.filter((p) => p !== id));
    else if (picked.length < 2) setFocus(month, [...picked, id]);
  };
  const tone = r.delta === null ? '' : r.delta > 0 ? 'good' : r.delta < 0 ? 'bad' : '';

  return (
    <section className="review" aria-label={`Review for ${monthLabel(month)}`}>
      <div className="review-l">
        <h2 className="display">{r.headline}</h2>
        <div className="rv-score">
          <span className="rv-big">{pct(r.cur.score)}</span>
          {r.delta !== null && <span className={'delta ' + tone}>{r.delta > 0 ? '+' : r.delta < 0 ? '−' : ''}{Math.abs(r.delta)} points vs {monthName(addMonths(r.month, -1))}</span>}
        </div>
        <dl className="rv-tally">
          <div><dt>Done</dt><dd style={{ color: 'var(--done)' }}>{r.cur.done}</dd></div>
          <div><dt>Partly</dt><dd style={{ color: 'var(--partial)' }}>{r.cur.partial}</dd></div>
          <div><dt>Missed</dt><dd style={{ color: 'var(--missed)' }}>{r.cur.missed}</dd></div>
          <div><dt>Not logged</dt><dd>{r.cur.unlogged}</dd></div>
        </dl>
      </div>

      <div className="review-r">
        {r.narrative.map((p, i) => <p key={i} className="narr">{p}</p>)}

        {r.tips.length > 0 && (
          <>
            <h3>Things to try next month</h3>
            <ul className="tips">{r.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </>
        )}

        {r.focusOptions.length > 0 && (
          <>
            <h3>Pick one or two to focus on</h3>
            <div className="chips" role="group" aria-label="Focus areas">
              {r.focusOptions.map((o) => {
                const on = picked.includes(o.id);
                return (
                  <button key={o.id} type="button" className={'chip focus' + (on ? ' on' : '')} aria-pressed={on} disabled={!on && picked.length >= 2} onClick={() => toggle(o.id)}>
                    {o.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <p className="rv-note"><Info size={14} aria-hidden /> Preview: this summary is written by simple rules from your numbers. In the live app Claude writes it.</p>
    </section>
  );
}
