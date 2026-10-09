# Karate Event Tracker · v1.0.0 Requirements & Design

## 1. Requirements (from project doc + decisions of 2026-09-28)
R1  Web app usable on phone, tablet, computer (responsive, touch-friendly); portable to native later (plain JS, no framework, logic isolated from UI).
R2  Event types: Tournament, Training Camp, Other (future types use the camp/“gathering” model).
R3  Tournament levels: Local, Regional, National, International.
R4  Roles: Director = full control/ownership. Manager = read/write data of assigned ring(s). Everyone else = read-only (spectator).
R5  Cloud database, role-based access, multiple concurrent readers/writers.
R6  Bracket format selectable per division (and default per ring/tournament): Single elimination, Round robin (pools of 4), Double elimination.
R7  Tournament events: Individual Kata (M/W), Individual Kumite (M/W), Team Kata (M/W/Mixed), Team Kumite (M/W), Fukugo (M/W), Enbu (M/W/Mixed).
R8  Black-belt divisions by age: Senior 21+, Youth 19–20, Junior 16–18, Cadet 14–15. Kyu divisions defined by director (rank range + age range).
R9  Track competitors: entering (registration + required info), competing (check-in, ring calls), results, awards.
R10 Manage rings, rounds, scores, competitor advancement.
R11 Scoring per WTKF traditional rules (user choice).
R12 Training camps: participants, sessions, attendance.
R13 Database: Google Firebase; hosting: Vercel; source: GitHub (project instructions). Also runs as a claude.ai hosted page.
R14 Development process: requirements → design → verify logic → code → test → fix → verify requirements → version bump.

## 2. WTKF-style scoring as implemented
- Kumite (Shobu Ippon): Ippon = 8 pts (ends bout), Waza-ari = 4 pts, two Waza-ari = Awasete Ippon (ends bout).
  Penalties to offender, points to opponent: Keikoku +2, Chui +4, Hansoku = disqualification. Kiken = withdrawal.
  Bout time default 2:00 (per division). Tie at time: Kettei-sen (default 0:30, first score wins) → fewer penalty points → Hantei (judges' flags).
- Kata / Team Kata / Enbu: per division choose FLAGS (3 or 5 judges, majority) or SCORES (3 or 5 judges, 0.0–10.0; with 5 judges high & low dropped).
  Score ties: compare dropped high, then dropped low, then flag decision.
  Defaults: Individual Kata = flags, Team Kata = scores, Enbu = scores.
- Team Kumite: 3 bouts (or 5), bout wins → total points → Daihyo-sen (representative bout).
- Fukugo: kata part (flags) + kumite part (points). Same winner both parts → winner; split → Hantei flag decision. (Assumption — confirm with director.)

## 3. Data model (cloud doc store)
events/{e}                         event: name, kind, level, dates, location, settings (age-as-of date, bronze mode, kyu division templates)
events/{e}/competitors/{c}         person + required info + entered events + check-in, fee, waiver
events/{e}/teams/{t}               team entrant (team kata/kumite/enbu): members, gender cat.
events/{e}/divisions/{d}           event type, gender, belt class, age range, rank range, format, scoring config, ring, order
events/{e}/rings/{r}               name, managerIds[]
events/{e}/sessions/{s}            camp sessions
live/{e}/brackets/{d}              bracket structure + per-match results (managers write)
live/{e}/attendance/{s}            camp attendance map (managers write)
live/{e}/rings/{r}                 “on the mat” call board (managers write)

Access rules: root read=view, write=admin (Director). `live` write=interact (Managers = Contributors).
Ring-level limit for managers is enforced in the app UI (server enforces director-only for all setup data).
Concurrency: each match result is merged as one nested key (`matches.{id}`) — two rings scoring different divisions/matches never overwrite each other. Advancement is derived from results, so a result write is a single atomic doc update.

## 4. Bracket algorithms
- Seeding: standard bracket seed order (1 v N …); seeds first, then others shuffled with same-dojo spread; byes go to top seeds.
- Single elimination: rounds W1..Wk; bronze mode “two bronzes” (both semi losers) or “3rd-place match”.
- Round robin: pools of ≤4 (balanced); each pool all-play-all (circle order). 1 pool → placings from standings. ≥2 pools → top 2 (2 pools) or top 1 (3+ pools) advance to single-elimination playoff, crossed (A1 v B2).
  Standings: wins → head-to-head (2-way ties) → point difference → points for → director tiebreak order.
- Double elimination: W bracket k rounds; L bracket 2(k−1) rounds (odd rounds pair L winners, even rounds meet W-round drop-downs); Grand Final + optional reset.
- Resolution is a pure function: sides are derived from sources (entrant | winner/loser of match). Byes auto-advance; empty-vs-empty collapses. Editing a result is blocked once a downstream match is scored (undo from the end).
- Placings: SE — gold/silver/bronze(×2 or match); DE — champion, GF loser, loser of L final; RR — standings.

## 5. Storage adapters (same app code)
- claude.ai store (`window.claude.use('db')`) — rules declared at publish (see §3).
- Firestore (`vercel/` build) — Google sign-in; `firestore.rules` enforces: director = roles/{uid}; ring manager may update only brackets of divisions on rings listing their uid, and that ring's live board; staff may write camp attendance; pv/ director-only. First director claims the role once (meta/bootstrap).
  `update` uses `set(…, {merge:true})` so nested match results merge exactly like the claude.ai store.
- Local store (browser storage) — used when no cloud is available; includes a “View as” role simulator for training/testing.

## 6. Verification (v1.0.0)
- Unit: 80 tests — ages, division matching, seeding, SE/DE/RR for 1–32 entrants (complete play-through, correct champion, DE loses-twice, reset final), RR ties + tiebreak, undo guard, all WTKF scoring paths.
- E2E (Playwright): demo tournament, draw 12 divisions, score 54 matches through the UI (flags, scores, kumite, team kumite, fukugo split/hantei), results & medal table, tiebreak, undo guard, competitor form, CSV import (quoted fields, bad rows), role views, camp sessions/attendance, phone width with no horizontal overflow, dark mode.
- Multi-user: director + manager + spectator against a rules-enforcing claude.ai-store mock and a Firestore mock: manager limited to own ring, writes to setup data rejected, concurrent saves on two rings both persisted, spectators read-only, private data hidden.
- Not yet verified: firestore.rules in the Firebase emulator (needs your Firebase project); real Vercel deploy.

## 7. Open questions for the director
- Fukugo split decision (currently Hantei) and Enbu/Team Kata scoring defaults — confirm against the WTKF rulebook edition you use.
- Kumite penalty values (Keikoku 2, Chui 4) and bout/Kettei-sen times are editable per division.

---

## Karate Event Tracker · v1.0.0

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

Hosted (claude.ai) version: https://claude.ai/artifact/4gL4JzrJHmYaftUQ1yYiNw · Source: ~/tournament tracker/karate-event-tracker (git, tag v1.0.0)
