import { useState, type FormEvent } from 'react';
import { useStore } from '../lib/store';

export function AuthView() {
  const { signIn, signUp, cloudLabel } = useStore();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      if (mode === 'in') await signIn(email, password);
      else {
        const r = await signUp(email, password);
        if (r.needsConfirm) {
          setMode('in');
          setMsg({ tone: 'info', text: 'Account created. Open the confirmation email, click the link, then sign in here.' });
        }
      }
    } catch (err) {
      setMsg({ tone: 'error', text: err instanceof Error ? err.message : 'Something went wrong. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="brand">
          <span className="mark" aria-hidden>✓</span>
          <span className="wm">Kaizen</span>
        </div>
        <h1 className="display">{mode === 'in' ? 'Sign in' : 'Create your account'}</h1>
        <p className="lede">Your habits and check-ins follow you between your laptop and your phone.</p>
        {cloudLabel === 'demo' && <p className="demo-note">Demo mode: accounts and data stay in this browser only.</p>}

        <form onSubmit={submit} aria-label={mode === 'in' ? 'Sign in' : 'Create account'}>
          <label className="field">
            <span className="flabel">Email</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span className="flabel">Password</span>
            <input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required minLength={mode === 'up' ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} />
            {mode === 'up' && <span className="hint">At least 8 characters.</span>}
          </label>
          <div className="auth-msg" role="status" aria-live="polite">
            {msg && <p className={msg.tone}>{msg.text}</p>}
          </div>
          <button type="submit" className="btn primary wide" disabled={busy || !email || !password}>
            {busy ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button type="button" className="btn quiet swap" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null); }}>
          {mode === 'in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
