# Put Kaizen online (free, permanent, works on your phone)

After this, nothing has to run on your laptop. The app lives at a web address, your data lives in Supabase,
and both your laptop and your phone just open the address.

Steps checked against Netlify's own docs (September 2026). I could not run Netlify from my side, so tell me if a screen differs.

## 0. Get the latest files
Extract `kaizen-with-hosting.zip` into `C:\kaizen` and choose **Replace the files in the destination**.
Your `.env.local` and `node_modules` are not in the zip, so they stay untouched.

## 1. Build the app
Open a terminal in `C:\kaizen\kaizen` (File Explorer address bar, type `cmd`, Enter) and run:

    npm run build

It ends with "built in ..." and creates a folder called `dist`.
The build copies the two values from `.env.local` into the app, so `.env.local` must be in place first.

## 2. Make a free Netlify account, and log in BEFORE the next step
Go to netlify.com and sign up (email or Google). An upload made while logged out expires after about a day.

## 3. Upload
Open **app.netlify.com/drop** and drag **the `dist` folder** onto the page. Only `dist`.
Not the `kaizen` folder, not the zip. Wait about ten seconds and you get an address like `https://something.netlify.app`.
Why only `dist`: if you drop the whole project, Netlify builds it in its own cloud without your `.env.local`,
and the site would quietly run without your database.

## 4. Give it a nicer address (optional)
On the site's page: **Site configuration > Change site name**.

## 5. Try it
Open the address, sign in with the account you already made, and your habit should be there.

## 6. Put it on your phone
Open the address in Chrome on your phone and sign in. Then either:
- Chrome menu (three dots) > **Install app** (or **Add to Home screen**), or
- in Kaizen, open **Manage** and press **Install**.

It gets its own icon and opens full screen. After the first visit it also opens with no connection,
and anything you tick while offline is sent when you are back online.

## 7. Lock the door
Now that the address exists, in Supabase go to **Authentication > Sign In / Providers** and switch
**Allow new users to sign up** off. Anyone can open the site, but nobody can create an account or see your data.

## Updating later
Run `npm run build` again, then open your site on Netlify, go to **Deploys**, and drag the new `dist` folder onto the
upload box at the bottom of that page. On your phone, close and reopen the app once to get the new version.

## If something is off
- **The site shows "Setup problem":** the build did not find `.env.local`, or a value has a typo. Fix it and run `npm run build` again.
- **The site opens but starts in the sample-data preview or has no sign-in:** the build ran without `.env.local`. Same fix.
- **Blank page or 404:** `index.html` must be directly inside what you dropped. Drop `dist` itself.
- **"Site not found" a day later:** the upload was made while logged out. Log in, drop `dist` again.
- **No "Install app" on the phone:** use Chrome, open the real address (not a preview), and reload once.

## Privacy
Anyone can open the address, but without your email and password they see nothing.
The key inside the app is Supabase's public "publishable" key; your data is protected by the row-level security rules.
Never put a `sb_secret_` or `service_role` key anywhere in this project.
