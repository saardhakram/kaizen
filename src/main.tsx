import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { cloudFromEnv, type Cloud } from './lib/cloud';
import './lib/install';
import './styles.css';

let cloud: Cloud | null = null;
let problem: string | null = null;
try {
  cloud = cloudFromEnv();
} catch (e) {
  problem = e instanceof Error ? e.message : String(e);
}

// lets the installed app open with no connection (skipped in previews and demos)
if ('serviceWorker' in navigator && import.meta.env.PROD && !['preview', 'demo-single'].includes(import.meta.env.MODE)) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    {problem ? (
      <div className="auth">
        <div className="auth-card">
          <h1 className="display">Setup problem</h1>
          <p className="lede">{problem}</p>
          <p className="hint">Fix that line in .env.local, save the file, then stop the app (Ctrl+C) and start it again with npm run dev.</p>
        </div>
      </div>
    ) : (
      <App cloud={cloud} />
    )}
  </StrictMode>,
);
