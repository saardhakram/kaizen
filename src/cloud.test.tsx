import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { createDemoCloud } from './lib/cloud';

const T = { timeout: 4000 };
const session = () => JSON.parse(localStorage.getItem('kaizen.demo.session') || 'null') as { userId: string; email: string } | null;
const backend = () => {
  const id = session()?.userId;
  return JSON.parse((id && localStorage.getItem(`kaizen.demo.data.${id}`)) || '{"habits":[],"logs":{},"settings":null}') as {
    habits: { name: string }[]; logs: Record<string, { status: string }>; settings: { cats: unknown[] } | null;
  };
};
const setOnline = (v: boolean) => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => v });
  act(() => void window.dispatchEvent(new Event(v ? 'online' : 'offline')));
};
const nav = (c: HTMLElement, label: string) => fireEvent.click(within(c.querySelector('.nav') as HTMLElement).getByRole('button', { name: label }));
const row = (name: string) => screen.getAllByText(name).map((e) => e.closest('li.lrow')).find(Boolean) as HTMLElement;

async function signUp(email = 'me@example.com', password = 'correct horse') {
  fireEvent.click(await screen.findByRole('button', { name: /New here/ }, T));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  await screen.findByText('No habits yet', {}, T);
}
async function addHabit(c: HTMLElement, name: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Add a habit' }));
  fireEvent.click(await screen.findByRole('button', { name: /New habit/ }));
  fireEvent.change(within(screen.getByRole('dialog')).getByPlaceholderText('Read 20 pages'), { target: { value: name } });
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save habit' }));
  nav(c, 'Today');
  await screen.findAllByText(name);
}

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
});
afterEach(() => cleanup());

describe('signed-in mode', () => {
  it('asks for sign-in first and starts an empty account with the default reasons stored', async () => {
    render(<App cloud={createDemoCloud()} />);
    expect(await screen.findByRole('heading', { name: 'Sign in' }, T)).toBeTruthy();
    expect(screen.getByText(/Demo mode/)).toBeTruthy();
    await signUp();
    await waitFor(() => expect(backend().settings?.cats).toHaveLength(13), T);
  });

  it('saves a habit and a check-in to the cloud, and both survive a reload', async () => {
    const first = render(<App cloud={createDemoCloud()} />);
    await signUp();
    await addHabit(first.container, 'Read 20 pages');
    fireEvent.click(within(row('Read 20 pages')).getByRole('button', { name: /Done/ }));
    await waitFor(() => {
      expect(backend().habits.map((h) => h.name)).toEqual(['Read 20 pages']);
      expect(Object.values(backend().logs).map((l) => l.status)).toEqual(['done']);
    }, T);

    first.unmount(); // like closing the tab
    render(<App cloud={createDemoCloud()} />);
    const again = await screen.findAllByText('Read 20 pages', {}, T);
    expect(again.length).toBeGreaterThan(0);
    expect(within(row('Read 20 pages')).getByRole('button', { name: /Done/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps working offline and sends everything when the connection returns', async () => {
    const r = render(<App cloud={createDemoCloud()} />);
    await signUp();
    await addHabit(r.container, 'Meditate');
    await waitFor(() => expect(backend().habits).toHaveLength(1), T);

    setOnline(false);
    fireEvent.click(within(row('Meditate')).getByRole('button', { name: /Done/ }));
    expect(within(row('Meditate')).getByRole('button', { name: /Done/ }).getAttribute('aria-pressed')).toBe('true'); // works instantly
    expect(await screen.findByText(/Offline\. 1 change will sync/, {}, T)).toBeTruthy();
    expect(Object.keys(backend().logs)).toHaveLength(0);

    setOnline(true);
    await waitFor(() => expect(Object.keys(backend().logs)).toHaveLength(1), T);
    await waitFor(() => expect(screen.queryByText(/Offline/)).toBeNull(), T);
  });

  it('explains a wrong password, and signing out returns to the sign-in screen', async () => {
    const r = render(<App cloud={createDemoCloud()} />);
    await signUp();
    nav(r.container, 'Manage');
    expect(screen.getByText('me@example.com')).toBeTruthy();
    expect(screen.queryByText('Sample data')).toBeNull(); // sample data never goes into a real account
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('heading', { name: 'Sign in' }, T);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'me@example.com' } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'wrong password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(/don't match/, {}, T)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'correct horse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('No habits yet', {}, T);
  });

  it("keeps two accounts' data apart on the same device", async () => {
    const r = render(<App cloud={createDemoCloud()} />);
    await signUp('a@example.com');
    await addHabit(r.container, "A's habit");
    await waitFor(() => expect(backend().habits).toHaveLength(1), T);
    nav(r.container, 'Manage');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('heading', { name: 'Sign in' }, T);
    fireEvent.click(screen.getByRole('button', { name: /New here/ }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'b@example.com' } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'another password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText('No habits yet', {}, T);
    expect(screen.queryByText("A's habit")).toBeNull();
  });
});
