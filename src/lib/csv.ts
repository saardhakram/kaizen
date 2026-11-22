import type { AppState } from '../types';
import { LABELS } from '../types';

/** A spreadsheet cell. Text that starts with = + - @ is defused so Excel never runs it as a formula. */
const cell = (v: string) => {
  const t = /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
  return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
};

/** Every logged entry as CSV. Opens cleanly in Excel and Google Sheets. */
export function toCsv(s: Pick<AppState, 'habits' | 'logs' | 'cats'>): string {
  const habits = new Map(s.habits.map((h) => [h.id, h]));
  const cats = new Map(s.cats.map((c) => [c.id, c.label]));
  const rows: string[][] = [['date', 'habit', 'type', 'result', 'main_reason', 'all_reasons', 'note']];
  const list = Object.entries(s.logs)
    .map(([k, l]) => {
      const [date, id] = k.split('|');
      return { date, h: habits.get(id), l };
    })
    .filter((e) => e.h)
    .sort((a, b) => (a.date === b.date ? (a.h?.name ?? '').localeCompare(b.h?.name ?? '') : a.date < b.date ? -1 : 1));
  for (const { date, h, l } of list) {
    if (!h) continue;
    const tags = (l.tags || []).map((t) => cats.get(t) ?? t);
    rows.push([date, h.name, h.kind, LABELS[h.kind][l.status], tags[0] ?? '', tags.join('; '), l.reason ?? '']);
  }
  return '\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** Save text as a file. Works in a normal browser tab; not inside sandboxed previews. */
export function downloadText(name: string, text: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
