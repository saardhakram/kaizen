# Set up Kaizen with your own database (phase 2)

You need: Node.js (the LTS version, 22 or newer, from nodejs.org), a free Supabase account (supabase.com),
and about 20 minutes. Supabase renames menus now and then; the wording below matches their docs as of September 2026.

## 0. Check the app runs (no account needed)
Unzip the project, open a terminal inside the `kaizen` folder, and run:

    npm install
    npm run dev:demo

Open the address it prints (usually http://localhost:5173), create a fake account and tick a habit.
This proves Node and the app work. Stop it with Ctrl+C.
Windows: open the folder in File Explorer, click the address bar, type `cmd`, press Enter.
Mac: right-click the folder and choose New Terminal at Folder.

## 1. Create the Supabase project
In Supabase choose **New project**. Pick the region closest to you and save the database password somewhere.
The app never uses that password. Wait about two minutes until the project is ready.

## 2. Create the tables
Open **SQL Editor > New query**, paste the whole of `supabase/schema.sql`, press **Run**.
You should see "Success. No rows returned". It is safe to run again.
This also switches on row-level security, so every account can only ever see its own rows
(`npm test` proves this against a real Postgres).

## 3. Turn off email confirmation
Open **Authentication > Sign In / Providers > Email** and switch **Confirm email** off, then save.
Supabase's built-in email sender only mails people on your own team and allows just a few emails per hour,
so confirmation emails are unreliable for a personal project.

## 4. Copy your keys
Open the project's **Connect** dialog (or **Settings > API Keys**) and copy:
- the **Project URL**, like https://abcdefgh.supabase.co
- the **publishable key**, which starts with `sb_publishable_`. Older projects show an `anon` key instead; it works the same.

Never put the **secret** key or the `service_role` key in this app.

## 5. Give them to the app
In the `kaizen` folder, copy `.env.example` to a new file called `.env.local`:

    Windows:  copy .env.example .env.local
    Mac:      cp .env.example .env.local

Open `.env.local` in any text editor, paste the two values after the `=` signs (no quotes), and save.

## 6. Run it

    npm run dev

Open the address it prints and choose **New here? Create an account**.
Then go back to **Authentication** in Supabase and switch **Allow new users to sign up** off,
so nobody else can create an account on your project.

## If something goes wrong
- **"Setup problem" page:** it names the line in `.env.local` to fix. After saving, stop the app (Ctrl+C) and run `npm run dev` again.
  The file is only read when the app starts.
- **"Could not load your data ... schema.sql":** the tables are missing. Repeat step 2.
- **"Could not reach the server" or "Offline" while you are online:** check the Project URL and key.
- **Sign-up says to check your email:** Confirm email is still on. Repeat step 3.
- **`npm` is not recognised:** close the terminal, open a new one, and try again.
- Anything else: the small pill at the top right and the Account section in Manage show the exact message. Send it to me.

## Good to know
- **Free projects pause after about 7 days with no activity.** Opening the app counts as activity.
  If you are away longer, open the Supabase dashboard and press **Restore project**.
  The app keeps working from the copy on your device and sends everything once the project is back.
- **The free plan keeps no backups.** Use **Manage > Download CSV** every few weeks.
- **Offline is fine.** Changes are saved on the device first and sent when a connection returns.
- **Other devices update when you open or refocus the app**, not instantly. If two devices edit the same entry, the last edit wins.
- **Signing out with unsent changes** keeps them on that device until you sign in again.

## Put it online and on your phone
See `DEPLOY.md`. It takes about ten minutes and the app then runs without your laptop.
