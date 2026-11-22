import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import App from './App';
import { detect } from './lib/tagger';
import { DEFAULT_CATS } from './lib/tagger';

const nav = (c: HTMLElement, label: string) => fireEvent.click(within(c.querySelector('.nav') as HTMLElement).getByRole('button', { name: label }));
// scoped to ledger rows: the closing sheet may still be animating out and repeats the habit name
const row = (name: string) => screen.getAllByText(name).map((e) => e.closest('li.lrow')).find(Boolean) as HTMLElement;

beforeEach(() => localStorage.clear());

describe('tagger', () => {
  it('finds several reasons and orders them by where they appear', () => {
    expect(detect('DBMS exam tomorrow and honestly not in the mood', DEFAULT_CATS)).toEqual(['exams', 'not_in_mood']);
    expect(detect("Couldn't get out of bed, felt lazy", DEFAULT_CATS)).toContain('laziness');
    expect(detect('', DEFAULT_CATS)).toEqual([]);
  });
});

describe('Today', () => {
  it('shows sample habits and the backfill banner', () => {
    render(<App />);
    expect(screen.getAllByText('Study 2 hours').length).toBeGreaterThan(0); // a daily habit, so this holds on any weekday
    expect(screen.getByText(/days are not logged/)).toBeTruthy();
  });

  it('logs Done in one tap and toggles it off', () => {
    render(<App />);
    const li = row('Study 2 hours');
    const done = within(li).getByRole('button', { name: /Done/ });
    fireEvent.click(done);
    expect(done.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(done);
    expect(done.getAttribute('aria-pressed')).toBe('false');
  });

  it('will not save a missed habit without a reason, then saves with a chip', () => {
    render(<App />);
    fireEvent.click(within(row('Study 2 hours')).getByRole('button', { name: /Missed/ }));
    const dlg = screen.getByRole('dialog');
    const save = within(dlg).getByRole('button', { name: 'Save entry' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(within(dlg).getByRole('textbox'), { target: { value: 'Exam tomorrow and not in the mood' } });
    expect(save.disabled).toBe(false);
    expect(within(dlg).getByRole('button', { name: /Exams and studies/ }).getAttribute('aria-pressed')).toBe('true');
    expect(within(dlg).getByRole('button', { name: /Not in the mood/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(save);
    expect(within(row('Study 2 hours')).getByText('Exams and studies')).toBeTruthy();
  });

  it('quit habits use their own words', () => {
    render(<App />);
    const li = row('No doomscrolling');
    expect(within(li).getByRole('button', { name: /Resisted/ })).toBeTruthy();
    expect(within(li).getByRole('button', { name: /Slipped/ })).toBeTruthy();
  });
});

describe('Grid and Manage', () => {
  it('renders the grid and opens a cell', () => {
    const { container } = render(<App />);
    nav(container, 'Grid');
    expect(container.querySelectorAll('.gc').length).toBeGreaterThan(100);
    const cell = container.querySelector('.gc.unlogged') as HTMLElement;
    fireEvent.click(cell);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('adds a habit', () => {
    const { container } = render(<App />);
    nav(container, 'Manage');
    fireEvent.click(screen.getByRole('button', { name: /New habit/ }));
    const dlg = screen.getByRole('dialog');
    fireEvent.change(within(dlg).getByPlaceholderText('Read 20 pages'), { target: { value: 'Journal' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save habit' }));
    expect(screen.getAllByText('Journal').length).toBeGreaterThan(0);
  });
});

describe('Insights', () => {
  it('draws all 21 graphs across four tabs', () => {
    const { container } = render(<App />);
    nav(container, 'Insights');
    const expected: Record<string, number> = { Overview: 5, Habits: 6, Reasons: 6, Patterns: 4 };
    let total = 0;
    for (const [tab, n] of Object.entries(expected)) {
      fireEvent.click(screen.getByRole('tab', { name: tab }));
      const cards = container.querySelectorAll('.cards .card');
      expect(cards.length, tab).toBe(n);
      expect(container.querySelectorAll('.cards .card div.empty, .cards .card .locked').length, `${tab} has placeholders with sample data`).toBe(0);
      total += cards.length;
    }
    expect(total).toBe(21);
    expect(container.querySelector('.review')).toBeTruthy();
  });

  it('survives an empty first-day sheet with placeholders instead of errors', () => {
    const { container } = render(<App />);
    nav(container, 'Manage');
    const erase = screen.getByRole('button', { name: /Start empty/ });
    fireEvent.click(erase);
    fireEvent.click(screen.getByRole('button', { name: /Tap again to erase/ }));
    nav(container, 'Today');
    expect(screen.getByText('No habits yet')).toBeTruthy();
    nav(container, 'Grid');
    nav(container, 'Insights');
    for (const tab of ['Overview', 'Habits', 'Reasons', 'Patterns']) {
      fireEvent.click(screen.getByRole('tab', { name: tab }));
      expect(container.querySelectorAll('.cards .card').length, tab).toBeGreaterThan(0);
    }
    expect(container.textContent).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('shows the locked placeholder after a single day of logging', () => {
    const { container } = render(<App />);
    nav(container, 'Manage');
    fireEvent.click(screen.getByRole('button', { name: /Start empty/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tap again to erase/ }));
    fireEvent.click(screen.getByRole('button', { name: /New habit/ }));
    const dlg = screen.getByRole('dialog');
    fireEvent.change(within(dlg).getByPlaceholderText('Read 20 pages'), { target: { value: 'Walk' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save habit' }));
    nav(container, 'Today');
    fireEvent.click(within(row('Walk')).getByRole('button', { name: /Done/ }));
    nav(container, 'Insights');
    fireEvent.click(screen.getByRole('tab', { name: 'Patterns' }));
    expect(container.querySelector('.locked')).toBeTruthy();
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
  });
});

describe('installing', () => {
  it('offers to install the app when the browser says it can', () => {
    const { container } = render(<App />);
    const prompt = vi.fn().mockResolvedValue(undefined);
    act(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true });
      Object.assign(e, { prompt });
      window.dispatchEvent(e);
    });
    nav(container, 'Manage');
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(prompt).toHaveBeenCalled();
  });
});
