# Karate Event Tracker · v1.13.3

Web app for karate tournaments, training camps and other events. Runs on phones (native-style bottom navigation; installable to the home screen from the Vercel build), tablets and computers.
Plain HTML/CSS/JS with the rules engine (`src/logic.js`) kept separate from the UI, so it can be reused in a native iOS/Android app later.

## What it does
- **Events**: Tournament (Local / Regional / National / International), Training camp, Other.
- **Roles**: App admin (every event; approves tournament directors) · Tournament director (creates events; full control of their own events only) · Ring manager (scores only their ring) · Spectator (read-only). Directors see other directors' events in the list but can only open them if they are added or their access request is approved.
- **Tournament events**: Individual Kata (M/W), Individual Kumite (M/W), Team Kata (M/W/Mixed), Team Kumite (M/W), Fukugo (M/W), Enbu (M/W/Mixed).
- **Divisions**: one-click black-belt set — Senior 21+, Youth 19–20, Junior 16–18, Cadet 14–15 — plus director-defined kyu groups (rank range + age range). Competitors are matched automatically by gender, age on the tournament date, and rank; directors can override.
- **Kata score pools** (ITKF system; default for black-belt Individual Kata, Team Kata, Enbu): pools of 8 (up to 12), 6 judges, high & low dropped (average), top 4 per pool advance until 8 remain, final elimination + final added together, different kata required in final elimination and final, Team Kata final adds Application; ties → all six scores → Kettei-sen.
- **Brackets** (per division, or set for a whole ring): Single elimination (two bronzes or bronze match), Round robin in pools of 4 (+ crossed playoff when there are several pools), Double elimination (repechage bracket + one grand final) and Double elimination (simplified: winners final = 1st/2nd, repechage final = 3rd/4th); both use pools of up to 8 above 8 entrants with the top 2 per pool to a playoff. Seeding, byes and same-dojo separation.
- **ITKF Competition Rules (2009)**: Shobu Ippon kumite (1:30; Waza-ari 4, Chui 4, Kei-koku 2, Jo-gai 2, Ten-to = penalty match (1 point only if time expired), escalations, Kettei-sen without carry-over, Hantei); Ko-go Kumite (default for Junior/Cadet and brown-belt kumite; 6 exchanges, Jikan/Kakushi/Saki/Nige-tai); team kumite by team total with Representative Kettei-sen; Fukugo alternating Kumite / Ki-tei. See DESIGN.md §8.
- **Live event across rings** (v1.5): each pool, the semifinal and the final of a division can run on its own ring, and single matches can be moved; division view and match view (live score and last actions); judges pool with kata/kumite credentials 1–7 (3+ for National/International); each judge works on one ring until moved, and every division, pool and round on that ring uses the ring's judges; officials per match assigned by the Shu-shin and recorded by the ring manager, a seated judge can't be picked twice (kata Shu-shin + Fuku-shin, kumite Shu-shin, 4 Fuku-shin, Kan-sa; required at National/International); spectators follow competitors, dojos, regions and countries.
- **Approve & archive** (v1.11): when the tournament is complete the director approves the results; the event becomes read-only and moves to the Archive (reopen if a correction is needed).
- **Judges import** (v1.10): CSV or spreadsheet paste with kata/kumite credential levels, country/region/dojo and ring; preview with National/International level checks; copy a judges pool from another event; export.
- **Demos**: Local tournament (clubs/dojos), National championship (regions), World championship (countries).
- **Go live** (v1.8): a readiness checklist (event drawn, competitors and judges checked in, rings with managers and helpers ready), then Go live; End live when the tournament is complete.
- **Public spectator link per event** (v1.6, Vercel + Firebase): created when the director goes live; spectators open it without signing in and land on that event's Dashboard (then Follow, Rings, Divisions) and cannot see other events. Stop sharing turns the link off.
- **People** (v1.7): directors and ring managers picked from everyone who has opened the tracker (like judges), or invited by email — on claude.ai they enter the invitation code from the email; on the Vercel site the role is applied when they first sign in.
- **Running the day**: ring queues, “call to the mat”, live score on the ring board, automatic advancement, undo (from the end of the bracket back), pool tiebreak order, placings, medal table by dojo, “medals presented” tracking, CSV import/export.
- **Camps**: participants, sessions, attendance by session, staff.
- **Privacy**: date of birth, contact and emergency details are stored separately (`pv/…`) and readable by directors only.

## Two ways to run it
1. **claude.ai hosted page** (already published) — uses the claude.ai shared database. Share the page from claude.ai: the owner is the director; share directors and ring managers as **Editors** (on a personal plan only Editors can record scores), then set their role on the People tab; Viewers = spectators (they need a claude.ai account; for sign-in-free spectators use the Vercel site's public event link).
2. **Vercel + Firebase** (this repo) — Google sign-in, Firestore database, access enforced by `firestore.rules`.

## Set up Firebase + Vercel + GitHub
1. **Firebase**: create a project at console.firebase.google.com → Build → Firestore Database (production mode) → Authentication → Sign-in method → enable **Google**.
   Project settings → Your apps → add a **Web app** → copy its config values into `window.KT_FIREBASE_CONFIG = {…}` in `vercel/firebase-config.js` (see `firebase-config.example.js`). Don't paste the console's `const firebaseConfig = …` snippet as-is — the app only reads `window.KT_FIREBASE_CONFIG`.
2. **Rules**: `npm i -g firebase-tools && firebase login && firebase use <project-id> && npm run deploy:rules`
   (or paste `firestore.rules` into Firestore → Rules → Publish).
3. **GitHub**: create an empty repo, then in this folder: `git remote add origin https://github.com/<you>/karate-event-tracker.git && git push -u origin main`.
4. **Vercel**: New Project → import the GitHub repo → Framework “Other”, no build command, output directory `vercel` (already in `vercel.json`) → Deploy.
   Then add the Vercel domain to Firebase → Authentication → Settings → **Authorized domains**.
5. Open the site, sign in, press **Become director** (the first person only). Ring managers sign in once, then the director assigns them on the Rings tab. After upgrading to 1.5, redeploy `firestore.rules` (needed again for 1.6 public links) (ring managers may score pools of other rings' divisions placed on their ring).

## Development
- Source: `src/` · build: `bash build.sh` → `dist/index.html` (claude.ai), `dist/karate-event-tracker.html` (standalone, local mode), `vercel/index.html` (Firebase).
- Tests: `npm test` (110 rules-engine tests) · `npm run test:e2e` (Playwright: full demo tournament, claude.ai-store mock, Firebase mock).
- Process: requirements → design → verify logic → code → test → fix → verify requirements → version bump. See `DESIGN.md`.

Data model and design decisions: `DESIGN.md`.
