# Kaizen: habit tracker (phases 1 and 2)

Track habits you want to build and habits you want to quit. Log each day as done, partly or missed,
give a reason for anything that slipped, and review the month with 21 graphs.

**Phase 1:** the full interface on sample data.
**Phase 2:** sign-in, sync between devices, offline queue, CSV export. See `SETUP.md` to connect your own Supabase project.
`DEPLOY.md` puts it online for free and makes it installable on a phone, with offline support.
Without Supabase settings the app runs on this device only, exactly like the phase 1 preview.
Reason tagging is keyword matching and the monthly summary is written by rules; both are placeholders for the AI in phase 3.

## Run it

    npm install
    npm run dev            # http://localhost:5173
    npm run dev:demo       # sign-in and sync on a fake in-browser cloud, no account needed
    npm test               # logging, all 21 graphs, sync engine, database rules (real Postgres), signed-in flow
    npm run build          # builds the dist folder that goes on a web host (see DEPLOY.md)
    npm run build:single   # one self-contained dist/index.html (what the preview uses; this-device-only, no export button)
    npm run build:demo     # same, with the demo cloud, into dist-demo/

## Where things are

    src/lib/stats.ts     every number behind the graphs and the monthly review
    src/lib/tagger.ts    keyword tagger (swapped for a Claude call in phase 3, same output shape)
    src/lib/sample.ts    sample-data generator (delete when real data replaces it)
    src/lib/store.tsx    app state: every change is an op that updates the screen and queues for the cloud
    src/lib/ops.ts       the ops (log, habit, settings) and how they apply
    src/lib/sync.ts      offline queue, retry, merge with what the cloud has
    src/lib/supabase.ts  the real Supabase adapter (sign-in, paged reads, row mapping)
    src/lib/cloud.ts     cloud interface, demo cloud, and how the app picks one
    src/lib/csv.ts       CSV export
    supabase/schema.sql  tables and row-level security
    src/views/           Today, Grid, Insights (+ tabs), Manage, the reason sheet
    src/charts/          the hand-drawn chart components
    src/styles.css       theme tokens (dark and light) and all styling
    public/              web manifest, icons and the offline service worker

## Roadmap

2. Supabase: sign-in, sync between laptop and phone, offline queue, CSV export  (built; first check against a real project pending)
3. Claude Haiku tags reasons; Claude writes the monthly review
4. Android: Capacitor wrapper, on-device reminders, APK build
5. Polish
