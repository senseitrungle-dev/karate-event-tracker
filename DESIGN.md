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
