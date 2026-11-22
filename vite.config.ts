import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`         -> normal multi-file build (Vercel / Capacitor)
// `npm run build:single`  -> one self-contained HTML file for the shareable preview (mode: preview)
// `npm run build:demo`    -> same, with the in-browser demo cloud (mode: demo-single)
// Modes are used instead of NAME=value prefixes because those do not work on Windows.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'preview' || mode === 'demo-single' ? [viteSingleFile()] : [])],
  build: { target: 'es2020' },
}));
