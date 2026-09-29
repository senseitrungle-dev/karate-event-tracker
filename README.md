# Karate Event Tracker · v1.0.0

Web app for karate tournaments, training camps and other events. Runs on phones, tablets and computers.
Plain HTML/CSS/JS with the rules engine (`src/logic.js`) kept separate from the UI, so it can be reused in a native iOS/Android app later.

## What it does
- **Events**: Tournament (Local / Regional / National / International), Training camp, Other.
- **Roles**: Director (full control) · Ring manager (scores only the divisions on their assigned ring) · Spectator (read-only).
- **Tournament events**: Individual Kata (M/W), Individual Kumite (M/W), Team Kata (M/W/Mixed), Team Kumite (M/W), Fukugo (M/W), Enbu (M/W/Mixed).
- **Divisions**: one-click black-belt set — Senior 21+, Youth 19–20, Junior 16–18, Cadet 14–15 — plus director-defined kyu groups (rank range + age range). Competitors are matched automatically by gender, age on the tournament date, and rank; directors can override.
- **Brackets** (per division, or set for a whole ring): Single elimination (two bronzes or bronze match), Round robin in pools of 4 (+ crossed playoff when there are several pools), Double elimination (repechage bracket + grand final with reset). Seeding, byes and same-dojo separation.
- **WTKF-style scoring**: Kumite shobu ippon — Ippon 8, Waza-ari 4, two Waza-ari = Awasete Ippon, Keikoku +2 / Chui +4 to the opponent, Hansoku, Kiken, Kettei-sen, Hantei; bout clock. Kata/Team Kata/Enbu by flags (3 or 5 judges) or scores 0–10 (high & low dropped with 5 judges). Team Kumite by bouts → points → Daihyo-sen. Fukugo = kata flags + kumite, split decided by Hantei.
- **Running the day**: ring queues, “call to the mat”, live score on the ring board, automatic advancement, undo (from the end of the bracket back), pool tiebreak order, placings, medal table by dojo, “medals presented” tracking, CSV import/export.
- **Camps**: participants, sessions, attendance by session, staff.
- **Privacy**: date of birth, contact and emergency details are stored separately (`pv/…`) and readable by directors only.

## Two ways to run it
1. **claude.ai hosted page** (already published) — uses the claude.ai shared database. Share the page from claude.ai: Editors = Directors, Contributors = can be assigned as ring managers, Viewers = spectators.
2. **Vercel + Firebase** (this repo) — Google sign-in, Firestore database, access enforced by `firestore.rules`.

## Set up Firebase + Vercel + GitHub
1. **Firebase**: create a project at console.firebase.google.com → Build → Firestore Database (production mode) → Authentication → Sign-in method → enable **Google**.
   Project settings → Your apps → add a **Web app** → copy its config into `vercel/firebase-config.js` (see `firebase-config.example.js`).
2. **Rules**: `npm i -g firebase-tools && firebase login && firebase use <project-id> && npm run deploy:rules`
   (or paste `firestore.rules` into Firestore → Rules → Publish).
3. **GitHub**: create an empty repo, then in this folder: `git remote add origin https://github.com/<you>/karate-event-tracker.git && git push -u origin main`.
4. **Vercel**: New Project → import the GitHub repo → Framework “Other”, no build command, output directory `vercel` (already in `vercel.json`) → Deploy.
   Then add the Vercel domain to Firebase → Authentication → Settings → **Authorized domains**.
5. Open the site, sign in, press **Become director** (the first person only). Ring managers sign in once, then the director assigns them on the Rings tab.

## Development
- Source: `src/` · build: `bash build.sh` → `dist/index.html` (claude.ai), `dist/karate-event-tracker.html` (standalone, local mode), `vercel/index.html` (Firebase).
- Tests: `npm test` (80 rules-engine tests) · `npm run test:e2e` (Playwright: full demo tournament, claude.ai-store mock, Firebase mock).
- Process: requirements → design → verify logic → code → test → fix → verify requirements → version bump. See `DESIGN.md`.

Data model and design decisions: `DESIGN.md`.
