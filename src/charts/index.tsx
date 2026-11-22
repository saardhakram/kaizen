import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Readout, cssVars, useMedia, useWidth } from '../ui';
import { LABELS, type Kind } from '../types';
import { fmtDay, monthShort } from '../lib/date';
import type { Cell } from '../lib/stats';

export interface Seg { v: number; color: string; name: string }
export interface Legend { name: string; color: string }

export function LegendRow({ items }: { items: Legend[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.name}>
          <i style={{ background: i.color }} />
          {i.name}
        </span>
      ))}
    </div>
  );
}

/* ───────────────────────── Ring ───────────────────────── */
export function Ring({ value, inner, size = 150, stroke = 14, big, small, color = 'var(--done)', label }: {
  value: number; inner?: number; size?: number; stroke?: number; big: string; small?: string; color?: string; label: string;
}) {
  const c = size / 2;
  const r = (size - stroke) / 2;
  const r2 = r - stroke - 3;
  const v = Math.max(0, Math.min(1, value));
  const iv = Math.max(0, Math.min(1, inner ?? 0));
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <g transform={`rotate(-90 ${c} ${c})`} fill="none" strokeLinecap="round">
          <circle cx={c} cy={c} r={r} className="ring-track" strokeWidth={stroke} />
          <motion.circle cx={c} cy={c} r={r} stroke={color} strokeWidth={stroke} initial={{ pathLength: 0 }} animate={{ pathLength: v, opacity: v > 0 ? 1 : 0 }} transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }} />
          {inner !== undefined && (
            <>
              <circle cx={c} cy={c} r={r2} className="ring-track" strokeWidth={4} />
              <motion.circle cx={c} cy={c} r={r2} stroke="var(--muted)" strokeWidth={4} initial={{ pathLength: 0 }} animate={{ pathLength: iv, opacity: iv > 0 ? 1 : 0 }} transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }} />
            </>
          )}
        </g>
      </svg>
      <div className="ring-center">
        <div className="ring-big" style={{ fontSize: size * 0.24 }}>{big}</div>
        {small && <div className="ring-small">{small}</div>}
      </div>
    </div>
  );
}

/* ───────────────────────── Columns (stacked) ───────────────────────── */
export interface Col { label: string; segs: Seg[]; hl?: boolean }
export function Columns({ cols, height = 170, legend }: { cols: Col[]; height?: number; legend?: Legend[] }) {
  const [tip, setTip] = useState('');
  const totals = cols.map((c) => c.segs.reduce((a, s) => a + s.v, 0));
  const max = Math.max(1, ...totals);
  const say = (c: Col) => `${c.label}: ${c.segs.filter((s) => s.v > 0).map((s) => `${s.v} ${s.name}`).join(', ') || 'nothing logged'}`;
  return (
    <div>
      <div className="cols" style={{ height }}>
        {cols.map((c, i) => (
          <button type="button" key={i} className={'col' + (c.hl ? ' hl' : '')} onMouseEnter={() => setTip(say(c))} onFocus={() => setTip(say(c))} onClick={() => setTip(say(c))} aria-label={say(c)}>
            <span className="col-n">{totals[i] || ''}</span>
            <span className="col-area">
              <motion.span className="col-stack" style={{ height: `${(totals[i] / max) * 100}%`, transformOrigin: 'bottom' }} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.5, delay: i * 0.02 }}>
                {c.segs.filter((s) => s.v > 0).map((s) => (
                  <i key={s.name} style={{ flexGrow: s.v, background: s.color }} />
                ))}
              </motion.span>
            </span>
            <span className="col-l">{c.label}</span>
          </button>
        ))}
      </div>
      {legend && <LegendRow items={legend} />}
      <Readout text={tip} />
    </div>
  );
}

/* ───────────────────────── Line chart ───────────────────────── */
export interface LineSeries { name: string; color: string; values: (number | null)[]; width?: number; dots?: boolean; area?: boolean; dash?: string }

export function LineChart({ labels, series, fmt = (v: number) => Math.round(v * 100) + '%' }: {
  labels: string[]; series: LineSeries[]; fmt?: (v: number) => string;
}) {
  const [box, W] = useWidth<HTMLDivElement>(600);
  const H = 220, L = 38, R = 12, T = 12, B = 26;
  const n = labels.length;
  const xEvery = Math.max(1, Math.ceil((n * 48) / Math.max(1, W - L - R)));
  const uid = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const x = (i: number) => L + (n <= 1 ? 0 : (i / (n - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - v) * (H - T - B);
  const segs = (vals: (number | null)[]) => {
    const out: [number, number][][] = [];
    let cur: [number, number][] = [];
    vals.forEach((v, i) => {
      if (v === null) {
        if (cur.length) out.push(cur);
        cur = [];
      } else cur.push([x(i), y(v)]);
    });
    if (cur.length) out.push(cur);
    return out;
  };
  const d = (pts: [number, number][]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const step = n > 1 ? (W - L - R) / (n - 1) : W;
  const tip = hover === null ? '' : `${labels[hover]}: ` + series.map((s) => `${s.name} ${s.values[hover] === null || s.values[hover] === undefined ? 'no data' : fmt(s.values[hover] as number)}`).join(', ');
  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} className="svgchart" role="img" aria-label={series.map((s) => s.name).join(' and ')} onMouseLeave={() => setHover(null)}>
        <defs>
          {series.filter((s) => s.area).map((s, k) => (
            <linearGradient key={k} id={`${uid}a${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={s.color} stopOpacity="0.32" />
              <stop offset="1" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="gl" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end">{Math.round(t * 100)}</text>
          </g>
        ))}
        {labels.map((l, i) => (i % xEvery === 0 ? <text key={i} x={x(i)} y={H - 6} textAnchor="middle">{l}</text> : null))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="guide" />}
        {series.map((s) => (
          <g key={s.name}>
            {s.area && segs(s.values).filter((p) => p.length > 1).map((p, j) => (
              <path key={j} d={`${d(p)} L${p[p.length - 1][0]} ${y(0)} L${p[0][0]} ${y(0)} Z`} fill={`url(#${uid}a${series.filter((q) => q.area).indexOf(s)})`} />
            ))}
            {segs(s.values).map((p, j) => (
              <path key={j} d={d(p)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dash} />
            ))}
            {s.dots && s.values.map((v, i) => (v === null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={2.4} fill={s.color} />))}
          </g>
        ))}
        {labels.map((_, i) => (
          <rect key={i} x={x(i) - step / 2} y={T} width={step} height={H - T - B} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
        ))}
      </svg>
      <LegendRow items={series.map((s) => ({ name: s.name, color: s.color }))} />
      <Readout text={tip} />
    </div>
  );
}

/* ───────────────────────── Stacked area ───────────────────────── */
export function StackedArea({ labels, series }: { labels: string[]; series: { name: string; color: string; values: number[] }[] }) {
  const [box, W] = useWidth<HTMLDivElement>(600);
  const H = 230, L = 34, R = 10, T = 10, B = 26;
  const n = labels.length;
  const every = Math.max(1, Math.ceil((n * 56) / Math.max(1, W - L - R)));
  const [hover, setHover] = useState<number | null>(null);
  const totals = labels.map((_, i) => series.reduce((a, s) => a + s.values[i], 0));
  const yMax = Math.max(4, Math.ceil(Math.max(...totals) / 4) * 4);
  const x = (i: number) => L + (n <= 1 ? 0 : (i / (n - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - v / yMax) * (H - T - B);
  let acc: number[] = new Array(n).fill(0);
  const paths = series.map((s) => {
    const lo = acc.slice();
    const hi = acc.map((a, i) => a + s.values[i]);
    acc = hi;
    let dd = hi.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    for (let i = n - 1; i >= 0; i--) dd += ` L${x(i).toFixed(1)} ${y(lo[i]).toFixed(1)}`;
    return { s, d: dd + ' Z' };
  });
  const step = n > 1 ? (W - L - R) / (n - 1) : W;
  const tip = hover === null ? '' : `Week of ${labels[hover]}: ` + (series.filter((s) => s.values[hover] > 0).sort((a, b) => b.values[hover] - a.values[hover]).map((s) => `${s.name} ${s.values[hover]}`).join(', ') || 'no slips');
  const ticks = [0, 1, 2, 3, 4].map((t) => (t * yMax) / 4);
  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} className="svgchart" role="img" aria-label="Reasons over time" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="gl" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end">{Math.round(t)}</text>
          </g>
        ))}
        {labels.map((l, i) => (i % every === 0 ? <text key={i} x={x(i)} y={H - 6} textAnchor="middle">{l}</text> : null))}
        {paths.map(({ s, d }) => (
          <path key={s.name} d={d} fill={s.color} fillOpacity={0.86} stroke="var(--surface)" strokeWidth={1} />
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="guide" />}
        {labels.map((_, i) => (
          <rect key={i} x={x(i) - step / 2} y={T} width={step} height={H - T - B} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
        ))}
      </svg>
      <LegendRow items={series.map((s) => ({ name: s.name, color: s.color }))} />
      <Readout text={tip} />
    </div>
  );
}

/* ───────────────────────── Donut ───────────────────────── */
export interface Slice { id: string; label: string; value: number; color: string; emoji?: string }
const polar = (cx: number, cy: number, r: number, a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
function arc(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(cx, cy, r1, a0);
  const [x1, y1] = polar(cx, cy, r1, a1);
  const [x2, y2] = polar(cx, cy, r0, a1);
  const [x3, y3] = polar(cx, cy, r0, a0);
  return `M${x0} ${y0} A${r1} ${r1} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 ${large} 0 ${x3} ${y3} Z`;
}

export function Donut({ slices, centerLabel }: { slices: Slice[]; centerLabel: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((a, s) => a + s.value, 0);
  let a = -Math.PI / 2;
  const gap = slices.length > 1 ? 0.03 : 0;
  const arcs = slices.map((s) => {
    const span = (s.value / total) * Math.PI * 2;
    const a0 = a + gap / 2;
    const a1 = Math.max(a0 + 0.001, Math.min(a + span - gap / 2, a0 + Math.PI * 2 - 0.001));
    a += span;
    return { s, d: arc(100, 100, 62, 92, a0, a1) };
  });
  const h = slices.find((s) => s.id === hover);
  return (
    <div className="donut">
      <div className="donut-svg">
        <svg viewBox="0 0 200 200" role="img" aria-label="Share of each reason">
          {arcs.map(({ s, d }) => (
            <path key={s.id} d={d} fill={s.color} opacity={hover && hover !== s.id ? 0.35 : 1} onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover(null)} onClick={() => setHover(hover === s.id ? null : s.id)} style={{ cursor: 'pointer', transition: 'opacity .15s' }} />
          ))}
        </svg>
        <div className="donut-c">
          <div className="donut-n">{h ? Math.round((h.value / total) * 100) + '%' : total}</div>
          <div className="donut-s">{h ? h.label : centerLabel}</div>
        </div>
      </div>
      <ul className="donut-legend">
        {slices.map((s) => (
          <li key={s.id} onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover(null)} className={hover === s.id ? 'on' : ''}>
            <i style={{ background: s.color }} />
            <span className="dl-name">{s.emoji} {s.label}</span>
            <span className="dl-n">{s.value}</span>
            <span className="dl-p">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────────────────────── Radar ───────────────────────── */
export function Radar({ axes, series }: { axes: string[]; series: { name: string; color: string; values: (number | null)[] }[] }) {
  const S = 300, c = S / 2, R = 106, n = axes.length;
  const [tip, setTip] = useState('');
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, v: number) => [c + Math.cos(ang(i)) * R * v, c + Math.sin(ang(i)) * R * v];
  const poly = (vals: (number | null)[]) => vals.map((v, i) => pt(i, v ?? 0).map((q) => q.toFixed(1)).join(',')).join(' ');
  const say = (i: number) => `${axes[i]}: ` + series.map((s) => `${s.name} ${s.values[i] === null ? 'no data' : Math.round((s.values[i] as number) * 100) + '%'}`).join(', ');
  return (
    <div>
      <svg viewBox={`0 0 ${S} ${S}`} className="svgchart radar" role="img" aria-label="Completion by weekday">
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <polygon key={t} points={axes.map((_, i) => pt(i, t).join(',')).join(' ')} className="gl" fill="none" />
        ))}
        {axes.map((_, i) => (
          <line key={i} x1={c} y1={c} x2={pt(i, 1)[0]} y2={pt(i, 1)[1]} className="gl" />
        ))}
        {series.map((s) => (
          <g key={s.name}>
            <motion.polygon points={poly(s.values)} fill={s.color} fillOpacity={0.16} stroke={s.color} strokeWidth={2} strokeLinejoin="round" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
            {s.values.map((v, i) => v === null ? null : <circle key={i} cx={pt(i, v)[0]} cy={pt(i, v)[1]} r={3.2} fill={s.color} />)}
          </g>
        ))}
        {axes.map((a, i) => {
          const [lx, ly] = pt(i, 1.22);
          return (
            <text key={a} x={lx} y={ly + 4} textAnchor="middle" className="radar-l" onMouseEnter={() => setTip(say(i))} onClick={() => setTip(say(i))}>{a}</text>
          );
        })}
      </svg>
      <LegendRow items={series.map((s) => ({ name: s.name, color: s.color }))} />
      <Readout text={tip} />
    </div>
  );
}

/* ───────────────────────── Sankey ───────────────────────── */
export interface SNode { id: string; label: string; color: string }
export function Sankey({ left, right, links }: { left: SNode[]; right: SNode[]; links: { from: string; to: string; v: number }[] }) {
  const [tip, setTip] = useState('');
  const [hot, setHot] = useState<string | null>(null);
  const [box, boxW] = useWidth<HTMLDivElement>(640);
  const W = Math.max(560, boxW), H = 400, nodeW = 10, lx = 160, rx = W - 160 - nodeW, gap = 8;
  const totL = new Map<string, number>();
  const totR = new Map<string, number>();
  links.forEach((l) => {
    totL.set(l.from, (totL.get(l.from) || 0) + l.v);
    totR.set(l.to, (totR.get(l.to) || 0) + l.v);
  });
  const L = left.filter((n) => totL.get(n.id));
  const Rn = right.filter((n) => totR.get(n.id));
  const sum = links.reduce((a, l) => a + l.v, 0);
  const scale = Math.min((H - gap * (L.length - 1)) / sum, (H - gap * (Rn.length - 1)) / sum);
  const topL = new Map<string, number>();
  const topR = new Map<string, number>();
  let yy = 0;
  L.forEach((n) => { topL.set(n.id, yy); yy += (totL.get(n.id) as number) * scale + gap; });
  yy = 0;
  Rn.forEach((n) => { topR.set(n.id, yy); yy += (totR.get(n.id) as number) * scale + gap; });
  const offL = new Map<string, number>();
  const offR = new Map<string, number>();
  const ribbons: { k: string; d: string; w: number; color: string; text: string; from: string; to: string }[] = [];
  L.forEach((ln) => {
    Rn.forEach((rn) => {
      const l = links.find((q) => q.from === ln.id && q.to === rn.id);
      if (!l) return;
      const h = l.v * scale;
      const y0 = (topL.get(ln.id) as number) + (offL.get(ln.id) || 0) + h / 2;
      const y1 = (topR.get(rn.id) as number) + (offR.get(rn.id) || 0) + h / 2;
      offL.set(ln.id, (offL.get(ln.id) || 0) + h);
      offR.set(rn.id, (offR.get(rn.id) || 0) + h);
      const x0 = lx + nodeW, x1 = rx, mx = (x0 + x1) / 2;
      ribbons.push({ k: ln.id + rn.id, d: `M${x0} ${y0} C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`, w: Math.max(1, h), color: rn.color, text: `${ln.label} to ${rn.label}: ${l.v}`, from: ln.id, to: rn.id });
    });
  });
  const dim = (r: { from: string; to: string }) => (hot ? (r.from === hot || r.to === hot ? 0.75 : 0.1) : 0.42);
  return (
    <div ref={box}>
      <div className="wide-scroll">
        <svg viewBox={`0 -4 ${W} ${H + 8}`} className="svgchart sankey" role="img" aria-label="Which habits are hit by which reasons" style={{ width: W }}>
          {ribbons.map((r) => (
            <path key={r.k} d={r.d} fill="none" stroke={r.color} strokeWidth={r.w} strokeOpacity={dim(r)} onMouseEnter={() => setTip(r.text)} onClick={() => setTip(r.text)} style={{ transition: 'stroke-opacity .15s' }} />
          ))}
          {L.map((n) => {
            const h = Math.max(4, (totL.get(n.id) as number) * scale);
            const y = topL.get(n.id) as number;
            return (
              <g key={n.id} onMouseEnter={() => setHot(n.id)} onMouseLeave={() => setHot(null)} onClick={() => setHot(hot === n.id ? null : n.id)} style={{ cursor: 'pointer' }}>
                <rect x={lx} y={y} width={nodeW} height={h} rx={2} fill="var(--text)" opacity={0.85} />
                <text x={lx - 8} y={y + h / 2 + 4} textAnchor="end">{n.label}</text>
              </g>
            );
          })}
          {Rn.map((n) => {
            const h = Math.max(4, (totR.get(n.id) as number) * scale);
            const y = topR.get(n.id) as number;
            return (
              <g key={n.id} onMouseEnter={() => setHot(n.id)} onMouseLeave={() => setHot(null)} onClick={() => setHot(hot === n.id ? null : n.id)} style={{ cursor: 'pointer' }}>
                <rect x={rx} y={y} width={nodeW} height={h} rx={2} fill={n.color} />
                <text x={rx + nodeW + 8} y={y + h / 2 + 4}>{n.label}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <Readout text={tip} hint={boxW < 560 ? 'Swipe sideways to see the reasons. Tap a habit to follow its flows.' : 'Tap a habit or a reason to follow its flows.'} />
    </div>
  );
}

/* ───────────────────────── Horizontal bars (HTML) ───────────────────────── */
export interface BarRow { key: string; label: string; emoji?: string; segs: Seg[]; right?: string }
export function Bars({ rows, max }: { rows: BarRow[]; max?: number }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.segs.reduce((a, s) => a + s.v, 0)));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="brow" key={r.key}>
          <div className="blabel">
            {r.emoji && <span className="bemoji" aria-hidden>{r.emoji}</span>}
            <span>{r.label}</span>
          </div>
          <div className="btrack">
            {r.segs.filter((s) => s.v > 0).map((s) => (
              <motion.i key={s.name} title={`${s.v} ${s.name}`} style={{ background: s.color }} initial={{ width: 0 }} animate={{ width: `${(s.v / m) * 100}%` }} transition={{ duration: 0.5 }} />
            ))}
          </div>
          <div className="bval">{r.right}</div>
        </div>
      ))}
    </div>
  );
}

export function Bullets({ rows }: { rows: { key: string; label: string; emoji: string; current: number; longest: number; atRisk: boolean }[] }) {
  const m = Math.max(1, ...rows.map((r) => r.longest));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="brow" key={r.key}>
          <div className="blabel">
            <span className="bemoji" aria-hidden>{r.emoji}</span>
            <span>{r.label}</span>
          </div>
          <div className="btrack bullet">
            <i className="best" style={{ width: `${(r.longest / m) * 100}%` }} />
            <motion.i className="now" initial={{ width: 0 }} animate={{ width: `${(r.current / m) * 100}%` }} transition={{ duration: 0.5 }} />
          </div>
          <div className="bval">{r.current} of {r.longest}{r.atRisk ? ' (paused)' : ''}</div>
        </div>
      ))}
      <LegendRow items={[{ name: 'Current run', color: 'var(--done)' }, { name: 'Longest run', color: 'var(--line2)' }]} />
    </div>
  );
}

export function PairedBars({ rows, prevLabel, curLabel }: {
  rows: { label: string; a: number; b: number; fmt: (v: number) => string; good: 'up' | 'down' }[]; prevLabel: string; curLabel: string;
}) {
  return (
    <div>
     <div className="pairs">
      {rows.map((r) => {
        const m = Math.max(r.a, r.b, 1);
        const diff = r.b - r.a;
        const tone = diff === 0 ? 'flat' : (diff > 0) === (r.good === 'up') ? 'good' : 'bad';
        return (
          <div className="pair" key={r.label}>
            <div className="pair-l">{r.label}</div>
            <div className="pair-bars">
              <div className="pair-track"><div className="pt"><motion.i className="prev" initial={{ width: 0 }} animate={{ width: `${(r.a / m) * 100}%` }} /></div><span>{r.fmt(r.a)}</span></div>
              <div className="pair-track"><div className="pt"><motion.i className="cur" initial={{ width: 0 }} animate={{ width: `${(r.b / m) * 100}%` }} /></div><span>{r.fmt(r.b)}</span></div>
            </div>
            <div className={'delta ' + tone}>{diff === 0 ? 'same' : (diff > 0 ? '+' : '−') + r.fmt(Math.abs(diff))}</div>
          </div>
        );
      })}
     </div>
      <LegendRow items={[{ name: prevLabel, color: 'var(--faint)' }, { name: curLabel, color: 'var(--accent)' }]} />
    </div>
  );
}

/* ───────────────────────── Matrix heatmap ───────────────────────── */
export interface MCell { bg: string; op?: number; text?: string; title: string }
export function Matrix({ rows, cols, cells, cw = 34, lw = 138, compact, focusCol }: {
  rows: { label: string; emoji?: string }[]; cols: string[]; cells: (MCell | null)[][]; cw?: number; lw?: number; compact?: boolean; focusCol?: number;
}) {
  const [tip, setTip] = useState('');
  const narrow = useMedia('(max-width: 640px)');
  const labelW = narrow ? Math.min(lw, 112) : lw;
  const sc = useRef<HTMLDivElement>(null);
  // bring one column (for example today) into view when the matrix is wider than the screen
  useEffect(() => {
    const box = sc.current;
    if (!box || focusCol === undefined) return;
    const el = box.querySelectorAll<HTMLElement>('.mx-col')[focusCol];
    if (!el) return;
    const over = el.getBoundingClientRect().right - box.getBoundingClientRect().right;
    if (over > 0) box.scrollLeft += over + 8;
  }, [focusCol]);
  return (
    <div>
      <div className="wide-scroll" ref={sc}>
        <div className={'mx' + (compact ? ' compact' : '')} style={{ gridTemplateColumns: `${labelW}px repeat(${cols.length}, minmax(${cw}px, 1fr))` }} role="table">
          <div />
          {cols.map((c, j) => (
            <div key={j} className="mx-col">{c}</div>
          ))}
          {rows.map((r, i) => (
            <Fragment key={i}>
              <div className="mx-row" title={r.label}><span aria-hidden>{r.emoji}</span> {r.label}</div>
              {cells[i].map((c, j) =>
                c ? (
                  <button key={j} type="button" className="mx-cell" title={c.title} aria-label={c.title} onMouseEnter={() => setTip(c.title)} onClick={() => setTip(c.title)}>
                    <i style={{ background: c.bg, opacity: c.op ?? 1 }} />
                    {c.text && <span className={(c.op ?? 1) > 0.6 ? 'hi' : ''}>{c.text}</span>}
                  </button>
                ) : (
                  <span key={j} className="mx-cell empty" />
                ),
              )}
            </Fragment>
          ))}
        </div>
      </div>
      <Readout text={tip} />
    </div>
  );
}

/* ───────────────────────── Year heatmap ───────────────────────── */
export interface HeatDay { date: string; score: number | null; future: boolean }
const lvl = (s: number | null) => (s === null ? 'lv0' : s < 0.35 ? 'lvlow' : s < 0.55 ? 'lv1' : s < 0.75 ? 'lv2' : s < 0.9 ? 'lv3' : 'lv4');
export function YearHeat({ weeks }: { weeks: HeatDay[][] }) {
  const [tip, setTip] = useState('');
  const sc = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (sc.current) sc.current.scrollLeft = sc.current.scrollWidth;
  }, []);
  const say = (d: HeatDay) => `${fmtDay(d.date)}: ${d.score === null ? 'nothing logged' : Math.round(d.score * 100) + '% completed'}`;
  return (
    <div>
      <div className="wide-scroll" ref={sc}>
        <div className="yh" style={{ minWidth: 560 }}>
          <div className="yh-months" style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}>
            {weeks.map((w, i) => (
              <span key={i}>{i === 0 || w[0].date.slice(0, 7) !== weeks[i - 1][0].date.slice(0, 7) ? monthShort(w[0].date) : ''}</span>
            ))}
          </div>
          <div className="yh-grid" style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }} role="img" aria-label="Completion for every day of the last year">
            {weeks.flatMap((w) => w.map((d) => <i key={d.date} className={'yh-c ' + (d.future ? 'fut' : lvl(d.score))} onMouseEnter={() => setTip(say(d))} onClick={() => setTip(say(d))} />))}
          </div>
        </div>
      </div>
      <div className="yh-key" aria-hidden>
        <span>Less</span>
        {['lvlow', 'lv1', 'lv2', 'lv3', 'lv4'].map((l) => <i key={l} className={'yh-c ' + l} />)}
        <span>More</span>
      </div>
      <Readout text={tip} />
    </div>
  );
}

/* ───────────────────────── Per-habit calendar ───────────────────────── */
export function HabitCal({ weeks, kind }: { weeks: { date: string; cell: Cell }[][]; kind: Kind }) {
  const [tip, setTip] = useState('');
  const word = (c: Cell) => (c === 'na' ? 'not scheduled' : c === 'future' ? 'upcoming' : c === 'unlogged' ? 'not logged' : LABELS[kind][c].toLowerCase());
  return (
    <div>
      <div className="hcal" style={cssVars({ '--w': weeks.length })} role="img" aria-label="Last six months for this habit">
        {weeks.flatMap((w) => w.map((d) => <i key={d.date} className={'hcc ' + d.cell} onMouseEnter={() => setTip(`${fmtDay(d.date)}: ${word(d.cell)}`)} onClick={() => setTip(`${fmtDay(d.date)}: ${word(d.cell)}`)} />))}
      </div>
      <div className="readout small">{tip || <span className="muted">Tap a square for the date.</span>}</div>
    </div>
  );
}
