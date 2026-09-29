# Karate Event Tracker · v1.2.1 Requirements & Design

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
R11 Scoring per WTKF traditional rules (user choice); from v1.1.0 aligned to the ITKF Competition Rules 2009 supplied by the director (see §8).
R12 Training camps: participants, sessions, attendance.
R13 Database: Google Firebase; hosting: Vercel; source: GitHub (project instructions). Also runs as a claude.ai hosted page.
R14 Development process: requirements → design → verify logic → code → test → fix → verify requirements → version bump.

## 2. v1.0.0 scoring (superseded by §8 in v1.1.0)
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
- (v1.1.0) Fukugo now follows ITKF alternating Kumite/Ki-tei; Ko-go Ippon value (10, not ending) is an assumption to confirm.
- Kumite penalty values (Keikoku 2, Chui 4) and bout/Kettei-sen times are editable per division.

## 8. v1.1.0 — Kata score pools + ITKF Competition Rules (2009) alignment
Sources: director's pool requirement (2026-09-28) and the ITKF Competition Rules 2009 PDF provided by the director.

### Kata score pools (Individual Kata, Team Kata, Enbu — ITKF Kata Art. 1-6, 2-2, 2-4, 2-5, 3-2)
- Pools of up to 8 (configurable 4–12; ITKF max 12). Every competitor performs once per round; 6 judges (Shu-shin + 5 Fuku-shin) score 0–10;
  highest & lowest dropped; score = average of the remaining four (sums used internally, identical ordering).
- Top 4 of each pool advance; pools continue until only 8 remain, then one final-elimination pool; its top 4 reach the final.
- Final score = final elimination + final. Elimination rounds are not cumulative.
- Kata change: final elimination and final each need a different kata than the previous round; Kettei-sen needs a kata different from the one that tied (enforced on save; Enbu exempt — choreography may repeat).
- Team Kata final: Kata + Application (Bunkai) scores; tie → higher Application, then its six scores, then Kettei-sen.
- Ties: add back all six scores; still tied (only where it matters: across the top-4 cut or among final places) → Kettei-sen, whose score only orders the tied competitors.
- Performance order: R1 random with seeded competitors last in their pool; later rounds lowest score first (equal → lower pool letter → who competed earlier); final: lowest final-elimination score first.
- Han-soku (zero card) → 0. Scores lock once the next round has a score.
- Defaults: black-belt Individual Kata, Team Kata and Enbu use this format with 6 judges. Enbu teams are pairs (2).

### Kumite — Shobu Ippon (Kumite Art. 1-6, 1-8, 2-3)
- 1:30 action time; first Ippon or Awase-waza (2 Waza-ari) wins.
- Time-up scoring: Waza-ari 4 · opponent Chui 4 · opponent Kei-koku 2 (2nd Kei-koku → Chui) · opponent Jo-gai 2 (2nd Jo-gai → Waza-ari awarded to the opponent, counts toward Awase-waza) · Ten-to not executed 1.
- Second Chui → the sheet flags Han-soku for the Court Judges to confirm (not automatic).
- Tie → Kettei-sen 1:30, no carry-over, first Waza-ari/Ippon wins; otherwise Court Judges decide (Hantei).
### Ko-go Kumite (Women's individual kumite, and women's Fukugo kumite rounds)
- Six exchanges: Aka attacks 1–3, Shiro 4–6. Jikan, Kakushi, Saki, Nige-tai 2 points to the opponent; Ten-to 1; Chui 4.
- Tie → Kettei-sen of six alternating exchanges from Aka: first Waza-ari/Ippon wins, else total, else Court Judges.
- Assumption: Ippon counts 10 points in Ko-go (ITKF team table value) and does not end the six exchanges — confirm.
### Team Kumite (Art. 2-3-B)
- 3 rounds of 1:30, all fought; round ends on Ippon/Awase-waza; team with the higher total wins (Ippon 10, Waza-ari 4, Jo-gai 2 each, Chui 4, Kei-koku 2 each, Ten-to 1).
- Any member Han-soku → team Han-soku; any member Ki-ken → team forfeit; tie → Kettei-sen by Representative (individual Kettei-sen rules).
### Fukugo (Fukugo Art. 1-3)
- Single elimination (no repechage), rounds alternate: final = Kumite, semi-final = Ki-tei, quarter-final = Kumite … third-place match = Kumite.
- Ki-tei: both perform the designated kata simultaneously; 5 judges each raise Aka or Shiro (no tie).

### Not yet implemented from ITKF (candidates for later versions)
- Sanbon Shobu option; kumite repechage system (Art. 1-13); detailed kata scoring forms (Basic/Skill point criteria and penalty deduction tables) — judges enter final numbers instead.

Tests: 100 unit tests; E2E scores 95 matches/performances through the UI (Shobu Ippon, Ko-go, team kumite, Fukugo kumite/Ki-tei, kata pools incl. kata-change enforcement and Kettei-sen); multi-user and Firebase mocks pass.

## 9. v1.2.0 — director clarifications (2026-09-29)
- Kata name list = ITKF Kata Rules Art. 1-3 (printed pp. 62–63): A-Nan-Kun, Bassai Dai/Sho, Chin-tei, En-pi, Gan-Kaku, Gojyu-Shi-Ho Dai/Sho, Han-Getsu, Ji-In, Ji-On, Jitte,
  Kan-Ku Dai/Sho, Shi-Ho-Ku-Chan-Ku, Kan-Shiwa, Kuru-Run-Ha, Ni-Jyu-Shi-Ho, Mei-Kyo, Roh-Hai Sho/Ni/San-Dan, Sai-Ha, San-Se-Ru, Se-San, Sei-En-Chin, Sei-Pai,
  Shi-So-Chin, So-Chin, Supa-Rin-Pan, Un-Su, Wan-Kan (Heian/Tekki kept for kyu divisions). Free text still allowed for other styles' names.
- Ko-go Kumite: points from all six exchanges are added together to decide the winner.
- Ko-go Kumite (v1.2.1, director 2026-09-29): no score from either competitor is treated like equal scores → straight to Kettei-sen; the first competitor to score Waza-ari or Ippon wins. (If Kettei-sen ends without one: Kettei-sen points, then Court Judges.)
Tests: 101 unit tests.
