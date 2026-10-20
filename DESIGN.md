# Karate Event Tracker · v1.36.0 Requirements & Design

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
R11 Scoring per WTKF traditional rules (user choice); from v1.1.0 aligned to the WTKF Competition Rules 2009 supplied by the director (see §8).
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
- (v1.1.0) Fukugo now follows WTKF alternating Kumite/Ki-tei; Ko-go Ippon value (10, not ending) is an assumption to confirm.
- Kumite penalty values (Keikoku 2, Chui 4) and bout/Kettei-sen times are editable per division.

## 8. v1.1.0 — Kata score pools + WTKF Competition Rules (2009) alignment
Sources: director's pool requirement (2026-09-28) and the WTKF Competition Rules 2009 PDF provided by the director.

### Kata score pools (Individual Kata, Team Kata, Enbu — WTKF Kata Art. 1-6, 2-2, 2-4, 2-5, 3-2)
- Pools of up to 8 (configurable 4–12; WTKF max 12). Every competitor performs once per round; 6 judges (Shu-shin + 5 Fuku-shin) score 0–10;
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
- Assumption: Ippon counts 10 points in Ko-go (WTKF team table value) and does not end the six exchanges — confirm.
### Team Kumite (Art. 2-3-B)
- 3 rounds of 1:30, all fought; round ends on Ippon/Awase-waza; team with the higher total wins (Ippon 10, Waza-ari 4, Jo-gai 2 each, Chui 4, Kei-koku 2 each, Ten-to 1).
- Any member Han-soku → team Han-soku; any member Ki-ken → team forfeit; tie → Kettei-sen by Representative (individual Kettei-sen rules).
### Fukugo (Fukugo Art. 1-3)
- Single elimination (no repechage), rounds alternate: final = Kumite, semi-final = Ki-tei, quarter-final = Kumite … third-place match = Kumite.
- Ki-tei: both perform the designated kata simultaneously; 5 judges each raise Aka or Shiro (no tie).

### Not yet implemented from WTKF (candidates for later versions)
- Sanbon Shobu option; kumite repechage system (Art. 1-13); detailed kata scoring forms (Basic/Skill point criteria and penalty deduction tables) — judges enter final numbers instead.

Tests: 100 unit tests; E2E scores 95 matches/performances through the UI (Shobu Ippon, Ko-go, team kumite, Fukugo kumite/Ki-tei, kata pools incl. kata-change enforcement and Kettei-sen); multi-user and Firebase mocks pass.

## 9. v1.2.0 — director clarifications (2026-09-29)
- Kata name list = WTKF Kata Rules Art. 1-3 (printed pp. 62–63): A-Nan-Kun, Bassai Dai/Sho, Chin-tei, En-pi, Gan-Kaku, Gojyu-Shi-Ho Dai/Sho, Han-Getsu, Ji-In, Ji-On, Jitte,
  Kan-Ku Dai/Sho, Shi-Ho-Ku-Chan-Ku, Kan-Shiwa, Kuru-Run-Ha, Ni-Jyu-Shi-Ho, Mei-Kyo, Roh-Hai Sho/Ni/San-Dan, Sai-Ha, San-Se-Ru, Se-San, Sei-En-Chin, Sei-Pai,
  Shi-So-Chin, So-Chin, Supa-Rin-Pan, Un-Su, Wan-Kan (Heian/Tekki kept for kyu divisions). Free text still allowed for other styles' names.
- Ko-go Kumite: points from all six exchanges are added together to decide the winner.
- Ko-go Kumite (v1.2.1, director 2026-09-29): no score from either competitor is treated like equal scores → straight to Kettei-sen; the first competitor to score Waza-ari or Ippon wins. (If Kettei-sen ends without one: Kettei-sen points, then Court Judges.)
Tests: 101 unit tests.

## 10. v1.3.0 — director changes (2026-10-01)
1. Double elimination: no reset match (single grand final). More than 8 entrants → pools of up to 8 (director may set the pool count); each pool runs double elimination; the top 2 of each pool go to a single-elimination playoff (2 pools: A1 v B2, B1 v A2 semifinals; 3–4 pools: quarterfinals). Third place per the division's bronze setting.
2. New format "Double elimination (simplified)": winners-bracket final decides 1st/2nd; repechage-bracket final decides 3rd/4th (no grand final; the winners-final loser does not drop into repechage). Pools: same as (1).
3. Kata pools: the final 8 is the Semifinal (a round with more than 8 always uses 2+ pools); its top 4 perform the Final. Final placing = Semifinal + Final scores. Kata change rule kept per WTKF: semifinal and final each need a different kata than the round before.
4–5. Kumite style defaults (gender no longer matters): black belt Senior/Youth → regular (Shobu Ippon); Junior/Cadet (≤18) → Ko-go; kyu divisions limited to brown belts (3rd–1st kyu) → Ko-go; other kyu divisions → regular until the director chooses. Applies to individual kumite, team kumite and fukugo kumite rounds. A director's explicit choice is kept; otherwise the default follows the division.
6. Ko-go: Aka attacks exchanges 1–3, Shiro 4–6. Offense side: Saki and Nige-tai disabled; defense side: Jikan and Kakushi disabled.
7. Recorded-score review: tapping a completed match (director / that ring's manager) shows how it was recorded — event-by-event log with running score and exchange/phase markers (kumite, Ko-go, team rounds), judges' flags (kata flags, Ki-tei), judges' scores with dropped high/low, and who/when. Tapping a scored kata competitor shows the recorded judge scores, kata and application.
Tests: 103 unit tests; E2E 102 matches/performances incl. DE pools + playoff, DES 1st–4th, Ko-go penalty disabling, recorded-detail views.

## 11. v1.4.0 — native-app mobile interface (2026-10-01)
- Phones (≤760 px): bottom tab bar with icons (Overview · Mat · Brackets · Results · More); "More" opens a sheet with the director's remaining sections (Competitors, Teams, Divisions, Rings) and All events. Compact top bar with a back button and the event name. Floating "+" button for the main add action (event, competitor/participant, ring, session). Tables become tappable card lists; 44 px touch targets; 16 px inputs (no iOS zoom); full-height bottom-sheet dialogs; press feedback; no horizontal scrolling.
- Color language for actionable areas: green = act now (Score buttons, matches ready to score, "Open scoresheet"); filled indigo = primary action; tinted indigo = navigation / secondary action; red tint = destructive; plain white = information only. Tappable rows and cards carry a › chevron.
- Vercel build is installable: web app manifest, home-screen icons, standalone display, theme color.

## 12. v1.4.1 (2026-10-01)
1. "Overview" tab renamed "Dashboard".
2. Dashboard boxes are buttons: Competitors → Competitors, Divisions → Divisions (Brackets for non-directors), Matches → Mat, Rings → Rings (Mat for non-directors). Camps: Participants, Sessions, Attendance.
3. Rings tab: lists only divisions that have competitors. Each division has a "Move…" menu to send it to another ring (added at the end of that ring's order) or remove it from the ring. Touch and hold (≈0.45 s) a division, then drag to reorder; a quick swipe still scrolls. Mouse: press-and-hold then drag. Keyboard: Alt+↑/↓. The new order saves on release; live updates pause while dragging.
Tests: ring drag (touch hold, swipe-without-hold, mouse), move to ring, dashboard buttons, plus full regression.

## 13. v1.5.0 — running a live event across rings; judges; officials; follow (2026-10-01)
Requirements (director, 2026-10-01): pools of a division on different rings; semifinal and final on the same or other rings; director dashboard / ring view / division view to move divisions and matches between rings and watch matches live; ring managers focus on current and upcoming matches; spectators follow competitors and watch matches; judges pool with credentials; judges assigned per ring / division / pool; officials per match on the score sheet.
Clarifications: under-level judges → warn but allow · officials required at National/International, optional at Regional/Local · spectators follow competitors, dojos/clubs, regions, countries (with search).

Design
- **Segments**: a drawn division splits into segments — `P:A`, `P:B`… (pools / elimination pools / first kata round with 2+ pools), `SF` (semifinal round), `F` (final, bronze, grand final). `division.segRings[seg]` overrides the division ring; `segRings['M:<matchId>']` moves a single match. `KT.ringOf(dv, seg, mid)` = match → segment → division ring. `KT.segOf`, `KT.kpSegOfKey`, `KT.segList` derive segments from the bracket (no stored state to drift).
- **Ring queues** include every match/performance whose ring resolves to that ring; the Rings tab lists "Pools & rounds from other rings' divisions" with a Move menu. Ring managers can score any segment run on their ring (`canScoreSeg`); Firestore rules accept `division.scorerIds`, which the director's client keeps equal to the managers of every ring a division touches.
- **Division view** (tap a division on Rings or Divisions): ring for the whole division and for each pool / semifinal / final, judges per segment, Draw / Bracket / Settings.
- **Match view** (tap any match on a ring board, queue or bracket, or a followed competitor): competitors, live score, phase and the last events pushed by the score sheet (`ringstate.log`), result with officials and recorded detail; the director can move the match to another ring; scorers get "Open scoresheet".
- **Judges** (`events/{e}/judges`): name, country, region, dojo, kata level 1–7, kumite level 1–7. Shown with country (International), region (National) or dojo (Regional/Local). `KT.judgeNeed`: level 3+ for National/International, 1+ otherwise; kata uses the kata level, kumite the kumite level, Fukugo the lower of both. Under-level judges carry a warning chip and a toast; assignment is allowed. Panels: `division.panels[seg|'all']` (segment panel empty → division panel). The Judges tab lists each judge's assignments (ring · division · pool) with Move… / Remove and an Assign menu.
- **Officials on the score sheet**: kata/Ki-tei — Shu-shin + Fuku-shin 1…n (one per scoring judge); kumite (all kumite kinds) — Shu-shin, Fuku-shin 1–4, Kan-sa. Assigned per match by the Shu-shin; the segment panel is listed first; the last set used on that segment is pre-filled. A judge cannot hold two positions. At National/International all positions are required before Confirm / Save; optional at Regional/Local. Saved on the result (`officials`); judge names appear under the score columns and in the recorded detail.
- **Follow** tab (first tab for spectators): search competitors, dojos/clubs, regions, countries; ☆ to follow (stored on the device). Each followed competitor shows every division with status — on the mat now, next match/opponent, ring and queue position, waiting, out, placing; dojo/region/country cards add members and medals.
- Default first tab by role: director Dashboard, ring manager Mat, spectator Follow. Director bottom bar: Dashboard · Rings · Divisions · Mat · More.
Tests: 109 unit tests (segments, ringOf, KP pool segments, judge eligibility, officials check); `test/v15.js` end-to-end (pool to ring, panels, judge move, manager pool permissions, officials required at National, match view live log, follow, spectator match view); full regression (e2e, claude.ai store mock, Firebase mock, mobile light/dark, ring drag).

## 14. v1.5.1 — judges belong to rings; pool rings visible; score font (2026-10-01)
Requirements (director): judges are assigned to a ring until moved to a different ring; a pool is assigned to a ring and the division view shows each pool's ring; every pool on a ring uses that ring's judges by default; for each match the Shu-shin assigns the positions and the ring manager records them; once a judge is seated, the name is removed from the other position lists so no judge is assigned twice; kumite score digits use a font whose zero has no dot.
Design
- `judges/{j}.ringId` replaces per-division/pool panels. Judges tab: Unassigned list + one card per ring, each judge with Move… (to another ring / Unassign); the Rings tab shows each ring's judges with "Add a judge to this ring…" (unassigned first, then judges from other rings = move). Deleting a ring unassigns its judges.
- Division view: main ring + one ring selector per pool / semifinal / final showing the ring by name (main ring marked), with that ring's judges. Bracket view (everyone): ring chip on every pool and kata round, and Semifinal / Final ring chips when they run elsewhere.
- Score sheet officials: options = judges of the ring running that match (pool/round/match ring) first, then other judges; a judge seated in one position is removed from every other position list; "Not seated" line lists the ring's remaining judges; the last panel used on the ring is pre-filled only for judges still on that ring.
- Dashboard: warns about rings with matches but no judges, unassigned judges, and judges below the event's credential level.
- Numbers (scores, clock, tallies, tables) use IBM Plex Sans with tabular figures — plain zero, no dot.
Tests: 109 unit; v15 e2e updated (judge ring moves, Unassigned list, pool ring chips in bracket view, ring-first officials, no double seating); full regression.

## 15. v1.5.2 (2026-10-03)
1. Bracket view: for the director each pool (and the semifinal and final) has a ring selector, so pools can be moved to other rings and run in parallel straight from the bracket; others see the ring as a label.
2. Shobu Ippon Ten-to per WTKF Kumite Art. 1-6-I / 1-7 and the scoring table (Art. 2-3-A): a fall is a Ten-to penalty match (Sagaru, Tsuzukete hajime) and scores no points; the opponent gets 1 point only when the Ten-to cannot be executed because time has expired (fall as the match ends). The sheet records Ten-to entered with time left as an executed penalty match (`exec`), and one entered with the clock at 0:00 as 1 point.
3. Scoring and penalty buttons (and Time up) are disabled while the match clock runs; the referee stops the clock (Yame) before a score or penalty is recorded.
Tests: 110 unit tests; v15 e2e adds bracket-view pool ring moves, clock gating and Ten-to penalty match.

## 16. v1.6.0 — public spectator link per event (2026-10-03)
Requirement (director): share each event publicly with its own link, viewable without an account; visitors land directly in that event's Dashboard and cannot see other events; spectator tab order Dashboard, Follow, Rings, Divisions.
Platform facts that shaped the design: on claude.ai, a visitor who isn't signed in gets no shared data at all, and every viewer of a publicly linked page can read all of the page's shared data (all events); outside Editors also lose write access while a page is shared by public link. So sign-in-free, per-event spectator links are delivered by the Vercel + Firebase build.
Design
- Director: Dashboard card "Public spectator link" → Create public link: a random 128-bit token; `share/{token}` = {eventId}; `events/{e}.public = true, shareToken`. Copy / Open / Stop sharing (deletes the token, `public = false`; sharing again makes a new link).
- Link: `<site>#watch=<token>`. The app resolves the token, watches only that event document, and opens the event as a spectator: no sign-in, no event list, no back button, no role switch, read-only; if sharing stops the open page shows "no longer shared".
- Firestore rules: `share/{token}` get-only (no list); `events/{e}` get when public, list only when signed in; event subcollections and `live/{e}/…` readable when the event is public; `pv/` (date of birth, contacts) and `users/`, `roles/` stay signed-in/director only.
- Spectator tabs (link visitors and signed-in spectators): Dashboard · Follow · Rings · Divisions · Brackets · Results · Competitors. Rings = each ring's live board plus the divisions and pools it runs; Divisions = searchable list with entrants, format, ring and pool rings, tap → bracket.
- claude.ai build: the share card explains that sign-in-free links need the Vercel site; signed-in viewers opening a `#watch=` address still get the single-event view.
Tests: test/public.js (local mode + Firebase mock with read rules): link token, landing on Dashboard, tab order, no event list/back/role switch/scoring, Rings and Divisions views, phone bar and More sheet, invalid token, stop sharing; signed-out Firebase visitor reads the shared event, cannot list events or read private details.

## 17. v1.7.0 — people: directors & ring managers, invite by email (2026-10-03)
Problem (director): a person the page was shared with did not appear when adding a ring manager, and typing their email did nothing. Cause: claude.ai's people search only covers the owner's own organization; people shared from outside (every invitee on a personal plan) are never returned by it.
Platform facts: on a personal plan only the owner and people shared as **Editor** can write shared data (outside people shared as Viewer/Contributor are read-only, and outside Editors lose write access while the page is shared by public link); the page cannot send email or change claude.ai sharing itself.
Design
- Roster: everyone who opens the tracker with edit access records `people/{id}` (seen time + their own display name as a fallback label). Ring cards get an "Add a ring manager…" picker from the roster (like judges); the organization search stays as a second option.
- Director = the page owner + people the owner/directors make directors (`meta/access.directors`); other Editors are ring managers once assigned to a ring (previously every Editor was a director).
- People tab (directors): Invite by email · Directors · Not assigned (people who opened it, with Assign… / Make director) · one card per ring with its managers (Move… / Remove).
- Invites: `invites/{id}` {email, role, event, ring}; "Create invite & email" opens the director's mail app with a prefilled invitation (claude.ai: create a free Claude account with this email, open the link, Request access; Vercel: open the site, sign in with Google). On claude.ai the director also adds the email as Editor in the Share menu. claude.ai never gives the page anyone's email, so each claude.ai invite carries a 6-character code: the invitee opens the tracker, enters the code on the Dashboard ("Have an invitation code?") and gets the role; they also appear under Not assigned for manual assignment. On the Vercel site the invite is matched to the Google sign-in email automatically. invites/ readable by editors only (claude.ai rule) / directors and the invitee (Firestore).
- Firestore: `invites/{email}`; an invitee may create their own director role or add only themself to the ring in their invite.
Tests: test/people.js (claude.ai mock with outside editors not findable by search and no emails; Firebase mock): invite email content and code, wrong code refused, auto-apply → ring manager scoring only their ring, roster picker, make director, Firebase invite on first sign-in.

## 18. v1.7.1 — fix: invitation email did not open (2026-10-04)
Locate: "Create invite & email" saved the invite (code shown on the People tab) but no email window appeared. Diagnose: the claude.ai page runs in a sandboxed frame that is not allowed to open the mail app by script (programmatic `mailto:` navigation is blocked). Fix: after creating an invite (and from "Send / copy" on a pending invite) a sheet shows the full invitation — subject, message with the code — with tap-to-open links that open in a new tab (Gmail compose, Outlook, the mail app) and "Copy invitation" for pasting into any email or text. Verify: test/people.js checks the sheet, the prefilled Gmail link and new-tab links; full regression.

## 19. v1.8.0 — Go live / End live (2026-10-04)
Requirement (director): claude.ai is for setting up and testing as director and ring manager; going public uses Vercel + Firebase. Give a "Go live" option once the event is set up, all competitors and judges are checked in, and the rings with their managers and helpers are ready; the director shuts live off when the tournament is complete.
Design
- Dashboard (director, before live): "Ready to go live?" checklist — every division with competitors drawn · every division on a ring · all competitors checked in (withdrawn excluded) · all judges on rings checked in · each ring has a full judging panel (checked-in judges ≥ the largest panel it runs; required at National/International, advisory otherwise) · every ring has a ring manager · every ring confirmed ready. Each open item links to its tab. "Go live" is enabled when everything required is ticked; "Go live anyway…" asks for confirmation.
- Judges tab: Check in / ✓ Checked in on each judge.
- Ring readiness (ring manager for their ring, or director; Mat tab and Rings tab, until live): helpers' names and "Ring is ready" (`live/{e}/ringready/{ring}`; Firestore: director or that ring's manager).
- Go live: `events/{e}.live = true, liveAt`; on the Vercel site also creates the public spectator link (share token). Live card: Copy link · Open public page (new tab) · End live. Event header shows ● Live / Finished.
- End live: confirmation (warns if divisions are unfinished); `live = false, endedAt`, public link removed.
- claude.ai: Go live marks the event live for the people the page is shared with; the card explains that the sign-in-free spectator link comes from the Vercel + Firebase site.
Tests: test/golive.js (checklist, disabled Go live, judge check-in, ring helpers and ready, Go live anyway, Copy/Open link, public page, End live cuts the link); test sign-in made robust; full regression.

## 20. v1.8.1 — fix: "Live" shown before the event went live (2026-10-04)
Locate: top-right chip read "● Live" on an event that was not live. Diagnose: that chip was the database-connection indicator (labelled "Live" since v1.0), which now clashes with the event's Go live state. Fix: the connection chip reads "Online" (tooltip: connected to the shared database); a separate red "● LIVE" chip appears in the top bar only while the open event is live (also on the public page). Verify: golive test checks no LIVE before Go live, LIVE while live, none after End live; regression.

## 21. v1.9.0 — several tournament directors, per-event access; tab colours; three demos (2026-10-04)
Requirements (owner): share the tracker with different tournament directors; each can only open events they created or were given; others' events may be listed but not opened. Decisions: only directors approved by the app admin create events; the owner is app admin (every event); a locked event offers "Request access", approved or declined by that event's directors.
Design
- Roles: App admin (claude.ai: page owner + meta/access.admins; Firebase: roles admin/director) · Tournament director (approved; claude.ai meta/access.directors, Firebase roles organizer) — may create events · Event director (`events/{e}.directorIds`; creator added automatically) · Ring manager (ring managerIds, mirrored in `events/{e}.managerIds`).
- Home: "My events" (open) and "Other events" (🔒, Request access / Request sent; live events open read-only). Non-approved people get "Request to become a tournament director" (`orgRequests/{id}`); the app admin card lists requests (Approve / Decline), approved tournament directors (Remove, add from people who opened the app) and app admins.
- People tab: access requests for this event (Approve as director of this event or as ring manager of a ring / Decline); "Directors of this event"; invites for event director or ring manager carry the event.
- Firestore rules: event list readable by signed-in users; event data, live data and pv/ only for the event's directors / ring managers / staff and app admins (or anyone while live + public); events created only by approved directors with themselves in directorIds; requests/{uid} self-create; invite application may add only yourself to directorIds / managerIds.
- claude.ai: the same access model in the app, but the claude.ai database cannot enforce per-event rules (editors could read other events' data with developer tools); enforced isolation needs the Vercel + Firebase site.
- Tabs: tinted tab bar with pill tabs (selected = filled indigo) on desktop/tablet; tinted bottom bar with filled active item on phones.
- Demos: "Create demo tournament" offers Local (Riverside Invitational — dojos/clubs, 2 rings), National championship (5 regions with clubs, 3 rings, judges by region, levels 2–7) and World championship (10 national teams, 4 rings, judges by country, levels 3–7).
Tests: test/access.js (Firebase mock with per-event rules: locked events, database denial, director requests and approval, own event, access request approved from People), test/demos.js (three demos), cloud/people tests updated (locked until assigned or live, invite code on Home); full regression.

## 22. v1.9.1 — see and change who directs which event (2026-10-04)
- App admin panel (Home, open by default): **Directors by event** — every event with its directors (✕ to remove; removing the last director asks first, then only app admins can open it) and an "Add director…" menu (approved tournament directors and anyone who has opened the app); **Events by director** — each director with the events they can open and manage.
- Every event card shows its directors; the top bar shows App admin / Tournament director on the Home screen.
- Inside an event, directors still manage their own team on the People tab (Directors of this event, access requests).
Tests: access test extended (tables, remove → no access, re-add → access, directors on cards).

## 23. v1.10.0 — import judges and credentials (2026-10-04)
Requirement: import a list of judges with their credentials, especially for National and International tournaments.
Design
- Judges tab: **Import judges** · **Export** · Add judge. Import takes a .csv file or text pasted from a spreadsheet (comma or tab separated). Headings recognised (any case/spacing): name (or first_name + last_name), country, region, dojo/club, kata_level, kumite_level (or one `level` for both; also credential/license/grade), ring, email, notes. Levels accept 5, L5, Level 5.
- Live preview before anything is written: each row New or Update (same name already in the pool → updated, not duplicated), with warnings — below level 3 at National/International (or only kata/kumite below), missing country (International) or region (National), unknown ring — and skipped rows (no name, no credentials, duplicates). "Insert example" fills a sample for the event's level.
- Ring column assigns judges to rings; otherwise an updated judge keeps their ring.
- "Copy the judges pool from another of your events" loads that event's judges (names and credentials) into the box for review.
- Export writes name, country, region, dojo, levels, ring, checked-in, notes as CSV — the same format the import reads.
- Judges tab layout: name and Move on one line, credentials / check-in below (fixes overlap in narrow ring cards).
Tests: test/judgeimport.js (headers, L5/Level 4, update vs new, warnings, skipped rows, ring assignment, TSV with single level column, copy from another event, export button).

## 24. v1.11.0 — approve results, lock and archive (2026-10-04)
Requirement: when the event is complete and the director approves the results, lock the event against further changes and move it to an archive so it no longer shows on the main list.
Design
- Dashboard (event director, once brackets exist and the event is not live): "Tournament complete" (all divisions finished) or "Finish the event" (N divisions not finished) card → **Approve results & archive** (asks for confirmation; warns when divisions are unfinished) and Review results.
- Approving sets `events/{e}`: locked, archived, approvedAt, approvedBy; ends live and removes the public link.
- Locked event: everyone is read-only (no settings, drawing, scoring, check-in, judges or people changes); banner "🔒 Official results — approved <date> by <name>. This event is archived and read-only." with **Reopen** for its directors and app admins (clears locked/archived, records reopenedAt/By). Header chip "🔒 Archived".
- Home: archived events leave the main list and appear in a collapsible **Archive** section at the bottom (count shown); cards carry "🔒 Archived".
- Firestore: every write under the event (event data, live data, pv/, invite ring self-add) requires the event not to be locked; only the event document stays writable by its directors (to reopen).
Tests: test/archive.js (card states, approve, read-only, archive list, reopen; Firebase denies writes to an archived event); full regression.

## 25. v1.12.0 — logo: 伝統空手道 (Dentō Karate-dō) with a rising sun (2026-10-04)
- Three logos, drawn as SVG with the kanji converted to vector paths from Noto Serif CJK JP Black (SIL Open Font License), so they look the same on every device without loading a Japanese font: **Horizon** (default — red sun rising over the horizon, 伝統空手道 beside it), **Hanko seal** (red seal, 空手道 / 伝統 in two columns with a small rising sun), **Sun with rays** (rayed rising sun with 伝統空手道). Note: the rayed rising-sun motif is considered offensive in some countries; the Horizon logo avoids it.
- The chosen logo is shown in every title bar (Home, events, sign-in, the public spectator page); on phones it is shown smaller next to the back button.
- App admins (or the director in local mode) choose the logo on Home → "App logo"; stored in `meta/branding` (Firestore: readable by anyone, writable by app admins).
- Home-screen / app icons (Vercel) redrawn with the rising-sun mark.
Tests: test/logo.js (default logo and label, picker with 3 options, switching, persistence, inside events, phone size, no overflow).

## 26. v1.12.1 — Hanko seal chosen; kanji kept inside the border (2026-10-04)
- The Hanko seal is now the default logo (title bar and home-screen icons). The seal was re-laid out: kanji at 26/100 of the seal, two centred columns (空手道 left, 伝統 + rising sun right), every character measured to sit at least 2 units inside the inner white border; slightly larger in the title bar (40 px; 34 px on phones). The other two logos stay selectable under Home → App logo.

## 27. v1.12.2 — Ko-go: each exchange is a stand-alone match (2026-10-05)
Director's ruling: every Ko-go exchange (Ko-geki) is a stand-alone match — it is over as soon as there is a score, a penalty, or Jikan when the 10 seconds run out. So two Jo-gai (or two Kei-koku) cannot occur in one exchange; each penalty is recorded for its own exchange (2 points to the opponent; Chui 4, Ten-to 1).
- Score sheet: recording a Waza-ari, Ippon or any penalty ends the exchange and starts the next one automatically ("· exchange over" in the log); "No score · next exchange" closes an exchange that ends without a score. Undo reopens it.
- Kettei-sen (alternating from Aka): a Waza-ari or Ippon wins at once; penalties only add points and end that exchange; after six, the total decides, then Court Judges.
- Han-soku / Ki-ken still end the whole bout. Shobu Ippon is unchanged: 2nd Kei-koku → Chui (4 points, not a Waza-ari); 2nd Jo-gai → Waza-ari to the opponent (counts for Awase-waza).
- Scores recorded before this version keep working (old logs have explicit "next" after each event).
Tests: unit test for auto-ending exchanges, Kettei-sen penalty vs Waza-ari, old logs; test/kogo.js on the score sheet; e2e regression.

## 28. v1.13.0 — fair draw, unique seeds, division pop-up → bracket, clock fix (2026-10-05)
- **Division pop-up → Bracket**: the Bracket button closes the pop-up and opens the Brackets tab on that division.
- **Unique seeds**: a seed number can be given to one entrant only. Division settings highlight clashing seed boxes as you type and explain which entrants share a seed; Save, Save & draw, Draw and Draw all are blocked until the seeds are unique (`KT.seedClashes`).
- **Draw separation by event level**: unseeded entrants are drawn at random but kept apart by group — International → country, National → state / region, Regional / Local → dojo (`entGroup`; a team uses its dojo or its members' common country / region).
  - Elimination brackets (SE, DE): seeds keep their positions and byes go to the top seeds; unseeded entrants are placed biggest group first into the open slot that meets same-group entrants as late as possible (different halves, then quarters …), followed by a swap pass to lower the total.
  - Pools (RR pools, DE elimination pools, kata score pools): seeds are snaked across the pools; the unseeded go to the pool with the fewest of their group (then the emptiest), so pool sizes stay balanced.
  - Separation is "where possible": when one group is bigger than the number of halves / pools, they are spread as evenly as the numbers allow.
- **Shobu Ippon clock Stop**: a physical mouse click (MacBook) on Stop could be lost because the clock repaint rewrote the button text every 200 ms while the button was held down. The clock now rewrites text only when it changes, and the Start / Stop button acts on press (pointerdown) — instant for the timekeeper — with the matching click ignored; keyboard Enter / Space still work.
Tests: unit tests (seed clashes; halves and quarters spread; seeds and byes kept; randomness; RR, DE and KP pools); test/v113.js (pop-up → bracket, seed clash UI and blocked save, slow mouse press on Start / Stop, quick click toggles once, keyboard); full regression.

## 29. v1.13.1 — Google sign-in on Vercel failed (2026-10-08)
- **Locate**: karate-event-tracker.vercel.app → "Sign in with Google" failed although the domain was authorized.
- **Diagnose**: the deployed `vercel/firebase-config.js` still set `window.KT_FIREBASE_CONFIG` to the example placeholders (`YOUR_API_KEY`); the real config had been pasted below it as `const firebaseConfig = {…}` (the Firebase console snippet), which the app never reads. Firebase was initialised with an invalid API key, so every sign-in was rejected.
- **Fix**: `firebase-config.js` now sets `window.KT_FIREBASE_CONFIG` to the project's values. The app now (a) detects placeholder values and says so on the sign-in screen with the button disabled, and (b) explains the common sign-in errors in plain language (invalid API key, unauthorized domain, Google provider off, pop-up blocked, API-key website restriction).
- **Verify**: test/signin.js (placeholder config shows the notice and disables sign-in; real-looking config enables it; error messages for each code).

## 30. v1.13.2 — phone title bar covered the top of the first card (2026-10-08)
- **Locate**: on the Vercel site on an iPhone (especially added to the home screen), the title bar hid the first rows of the first card; pop-up titles could sit under the status bar.
- **Diagnose**: the page uses `viewport-fit=cover` with a translucent status bar, so the status bar overlays the page. The title bar was `position: sticky; top: env(safe-area-inset-top)` — a sticky offset applies even at the top of the page, so the bar was pushed down by the status-bar height and covered that much of the content beneath it; scrolled, content showed through above it. Phone pop-ups filled the screen from y = 0, under the status bar.
- **Fix**: the title bar sticks at `top: 0` and pads its content down by the safe-area inset (its dark background fills behind the status bar); the desktop tab strip sticks right under the measured bar height; pop-ups (scrim) are padded by the inset; left/right insets respected in landscape. The inset is read once into `--sat`.
- **Verify**: test/safearea.js simulates a 47 px status bar on a 390×844 phone: bar content below the status bar, first card below the bar, nothing shows through when scrolled, pop-up title below the status bar; mobile and e2e regression.

## 31. v1.13.3 — choose the Google account when signing in (2026-10-08)
- **Locate**: after Sign out, Sign in with Google went straight back into the previous account; no way to pick another.
- **Diagnose**: signing out ends the tracker's Firebase session only; the browser stays signed in to Google, and Google's pop-up silently reuses that account unless asked to show the chooser.
- **Fix**: the Google provider is created with `prompt: 'select_account'`, so the account chooser (with "Use another account") appears on every sign-in.
- **Verify**: test/signin.js checks the provider asks for the account chooser; fb, access, people, public regression.

## 32. v1.14.0 — WTKF naming; remove a person from one event (2026-10-08)
- **WTKF**: the federation is now named WTKF everywhere (score sheets, division settings, kata list, help text, docs, tests; `KT.WTKF_KATA`). The rules themselves are unchanged (Competition Rules 2009).
- **Remove from event** (People tab, director or app admin): on every director and ring manager row. It takes the person out of *this* event only — `directorIds`, every ring's `managerIds`, the event's `managerIds` and `staffIds`, division scorer lists, pending invitations to this event and any open access request — and leaves their account and their roles in all other events untouched. A confirmation says so; they can be added again later.
  - "Remove as director" stays for the narrower change (stop being a director, keep any other role here).
  - An event always keeps at least one director (unless an app admin is acting); a sole director sees "You · only director".
- **Event access follows ring changes at once**: assigning or removing a ring manager now updates the event's `managerIds` immediately (before, it waited for a background sync while the event stayed open, so a newly assigned manager could find the event still locked).
- **Rules**: any director of the event may delete that event's pending invitations (`firestore.rules` v1.14.0 — **redeploy the rules**).
- **Verify**: test/removeevent.js (Firebase mock with the per-event rules): manager and director set up in two events; a non-admin director removes the manager from event 1 → gone from event, rings and division scorers, still manager in event 2, event 1 locked for them / event 2 opens; admin removes a director from event 1 → still director of event 2; full regression (120 unit tests + 19 browser suites).

## 33. v1.15.0 — winners stand out; Ko-go attacker in corner colours (2026-10-11)
- **Winner of a match** (score sheet as soon as the result is decided, finished-match sheet, match view): a large winner banner in the winner's corner colour — Aka red with white text, Shiro white with dark text — framed in gold with a ★, showing "Winner · Aka/Shiro", the name, how it was won and the score. The winning corner gets a gold outline and a "★ Winner" badge; the other corner is dimmed.
- **Match view of a finished match** shows the recorded result and score, not a leftover "In progress" live board.
- **Ko-go Kumite**: the "Aka attacks" / "Shiro attacks" block in the middle is filled with the attacker's colour (red / white with a dark border); the attacking corner is ringed and tagged "⚔ Attacking", the other "Defending"; log lines carry a red or white dot for the side; in the result record each exchange header row is red (Aka attacks) or white (Shiro attacks).
- **Brackets**: the winner's line is tinted, bold, with a green ✓ and bold score; the loser's line is faded and struck through. A bye advance is bold without the ✓ (no match was won).
- **Verify**: test/winner.js (Ko-go colours on exchanges 1 and 4–5, Shobu Ippon winner banner/outline/dim, bracket ✓ and faded loser, match view banner and final score); full regression.

## 34. v1.16.0 — "About this app" from the logo (2026-10-11)
- Tapping the logo at the top left (every screen: sign-in, home, events, public spectator page) opens **About this app**: logo, app name (伝統空手道 · Dentō Karate-dō · WTKF), **version**, **status** (Online / Local mode / Connecting / Not signed in, plus ● LIVE, Archived or Public link for the open event), where the data lives (Vercel + Firebase project, claude.ai shared database, or this browser), the **signed-in user** (name and email; "public spectator link" or "not signed in" when relevant) and **role** (app-wide: App admin / Tournament director / Member; in the open event: Director, Ring manager with ring names, or Spectator).
- **Close** (or ✕, Esc, tapping outside) removes it; on the Vercel site it also offers Sign out. Tapping the app name still goes to the event list.
- Verify: test/about.js (local desktop + phone, inside an event, Firebase sign-in screen and signed-in admin); full regression.

## 35. v1.17.0 — tidier running order and division list; faster officials and score entry (2026-10-11)
- **Ring card**: a finished division leaves "Divisions, in running order" (numbering and drag only cover what is still to run). Finished divisions are listed under a folded "Finished · n" line, each tappable to open its pop-up.
- **Divisions tab**: grouped top to bottom — **Not finished** (has entrants, not complete), **Finished**, **No entrants** (bottom) — with a header row and count for each group. Inside each group: black-belt divisions by age group (youngest first: Cadet, Junior, Youth, Senior), then kyu divisions by rank (10th kyu → 1st kyu, then age); ties by event (Kata, Kumite, Team Kata, Team Kumite, Fukugo, Enbu) and gender.
- **Officials (judges) on a score sheet**: after picking a judge for a position, focus moves to the next empty position; once every position is filled the list folds away (and on kata pool sheets focus moves on to the kata name). A **Done** button folds it at any time; tap "Officials" to reopen.
- **Judges' scores** (kata score pools and kata flags/scores sheets): a complete entry — one decimal such as 7.5, or 10 — jumps straight to the next judge; Enter does the same (for whole numbers like 8). After the last judge, **Save score / Confirm result** gets focus and a pulsing green highlight, so Enter saves.
- **Call to Ring** wording: the toast now says the pair is shown as "now on the mat" for that ring.
- Verify: test/v117.js (finish a division → ring card and Divisions grouping/sorting; officials stepping and fold-away; score entry 7.5 / 10 / Enter → next judge → Save highlighted → Enter saves); full regression.
- **Phones — one tap on a kata pool competitor** opens their score card: the competitor is now a real button, every tappable row/card uses `touch-action: manipulation` (no double-tap-zoom wait), and hover effects apply only on devices with a mouse, so a first tap is never spent on "hover".
- **Phones — lists in pop-ups close when an item is picked**: on touch devices a chosen option closes the picker; the app no longer moves focus to the next drop-down (which kept the phone's picker open on the next field) or to the kata name. On a computer the keyboard-friendly focus stepping stays.

## 36. v1.17.1 — selectable division order (2026-10-11)
- Divisions tab, under the actions: **Order** — three drop-downs the director sets for the event (saved on the event as `divOrder`, so ring managers and spectators see the same order; read-only for them):
  - Groups: **Not finished first** (default) or **Finished first** — divisions with no entrants always stay at the bottom.
  - Age groups: **Youngest first** (default) or **Oldest first**.
  - Kyu ranks: **10th → 1st** (default) or **1st → 10th**.
- The spectators' Divisions list follows the same age/rank order.
- Verify: test/divorder.js (default youngest first; oldest first; kyu order switch; saved on the event after reload; group order selectable); regression.

## 37. v1.17.2 — phone drop-downs close after a choice, everywhere (2026-10-11)
- **Locate**: on phones, drop-down lists in cards (Rings: Add a judge, Move…, Assign a division, Add a ring manager; Divisions/People selects) and in pop-ups stayed open after picking.
- **Diagnose**: after every change the screen is redrawn, and the redraw put keyboard focus back on the same drop-down (by id) — on a phone that keeps or re-opens its picker. v1.17.0 only released drop-downs inside pop-ups, and pop-ups also auto-focused their first field on open.
- **Fix** (touch devices only; mouse/keyboard behaviour unchanged): the chosen drop-down is released first and the change is applied a moment later (after the phone's picker has closed); the redraw never re-focuses a drop-down; pop-ups don't auto-focus a field on open; picking from a search list (ring manager / staff) closes every list.
- **Verify**: test/touchselect.js (iPhone emulation: ring card Add a judge, Move…, a pop-up drop-down — none left focused, change applied); regression.

## 38. v1.17.3 — tap the kata competitor "On the mat" (2026-10-11)
- Dashboard (and Mat) ring cards: tapping the kata competitor shown **On the mat**, or a kata competitor in **Up next**, opens that competitor's score card for people who can score it (director, that ring's manager); spectators are taken to the division's bracket. Kumite pairs already opened their match.
- Verify: test/matnow.js (phone: call a kata competitor, tap on the Dashboard → their score card; Up next → score card; spectator → bracket); regression.

## 39. v1.18.0 — larger, darker text (2026-10-11)
- **One size larger everywhere**: the root size goes from 16 px to 18 px (every rem-based size grows 12.5 %); body text 15 → 17 px (phones too); form fields 16 → 18 px.
- **Regular-weight text darker / easier to read**: secondary text colours darkened — `--ink-2` #4d525c → #33373f, `--ink-3` #7b808a → #50555e (dark mode brightened: #b4b9c4 → #d3d7de, #868c98 → #aeb3bd); body text uses a slightly heavier weight (medium where the font has it); faded helper text in the title bar and score boards made more opaque.
- **Phones, to make room**: bottom-tab labels keep a fixed 12 px with tighter spacing ("Dashboard" fits); on screens narrower than 480 px the connection chip (Online / Local mode) leaves the title bar — the status is in the About pop-up (tap the logo); ● LIVE stays.
- Verify: screenshots desktop + iPhone (no sideways scrolling, tab labels fit); full regression.

## 40. v1.19.0 — Shobu Ippon time-up flow; big Start/Stop (2026-10-17)
- **Locate / diagnose**: when the match clock reached 0:00 nothing happened — the ring manager had to notice and press "Time up", reset the clock for Kettei-sen and end it by hand.
- **Fix — automatic on 0:00** (Shobu Ippon individual bouts, team rounds, Representative and Fukugo kumite):
  - Regular time, one side ahead → that side wins on points.
  - Regular time, scores tied → **Kettei-sen**: the clock resets to the Kettei-sen time (1:30 by default, set per division), stays stopped and waits for the Shu-shin's Hajime; the regular-time scores **stay on the board** (the next Waza-ari decides). No Kettei-sen time set → Hantei.
  - Kettei-sen time runs out with no score → **Hantei**: the clock and Start are hidden, the two Hantei buttons are highlighted for the Court Judges' decision.
  - Team rounds still end in Hiki-wake on a tie (team total decides). The manual "Time up" / "End Kettei-sen" buttons remain as small fallbacks.
- **Start/Stop**: a full-width 64 px button under the clock — green **Start**, red **Stop**. While the clock waits for Hajime (match start, after Kettei-sen reset) it pulses as the one expected next action, a one-line hint says what to do, and the scoring buttons are dimmed. Re-opening a sheet that is in Kettei-sen sets the Kettei-sen clock.
- Verify: test/timeup.js (fake clock: Start highlighted; tie at 0:00 → Kettei-sen, 1:30, stopped, 4–4 kept; Kettei-sen 0:00 → Hantei with highlighted buttons → winner; lead at 0:00 → winner on points); full regression.

## 41. v1.20.0 — invite people to the app by email (2026-10-17)
- **Home → App admin card → Invite people to the app**: email + "Invite as" **Tournament director** (may create events) or **Ring manager** (added to events by a director). The invitation sheet (Gmail / Outlook / mail app / copy) explains the next steps; pending invitations are listed with Send / copy and Cancel.
- **Accepting**: on the Vercel site the invitee signs in with Google using that email — the invitation is accepted automatically (tournament director → `roles/{uid}` organizer, so "New event" appears; everyone → `users/{uid}.invitedAs`); on claude.ai they enter the invitation code (also add them as an Editor in Share).
- **Adding to events**: the admin card lists accepted people with the events they are in, and an **Add to event** control (event + as Director / as Ring manager). A ring manager added this way joins the event's staff (they can open it) and shows on the event's People tab as "Added · pick a ring" for the event director to choose the ring. Directors can still add people themselves on their event's People tab.
- **Sign-in**: invitees see exactly the events they were added to (plus any they create, for tournament directors). Directors create events as before.
- **Rules** (`firestore.rules` v1.20.0 — **redeploy**): only app admins can create app-level invitations; an invitee may create their own `roles/{uid}` = organizer only while an app invitation for their email with role organizer exists.
- Verify: test/appinvite.js (Firebase mock with rules: invite director + ring manager, both accept on sign-in, rights checked, non-admin cannot create app invitations, admin adds them to an event, they open it with the right role, People tab marker); full regression.

## 42. v1.21.0 — app admin: emails, Not assigned, Access removed (2026-10-17)
- **Every person in the App admin card shows name + email** (approved tournament directors, ring managers, not assigned, access removed, requests, app admins), plus the events they are in.
- **Ring managers** is now its own list (invited as ring manager, made one by the admin, or managing/staff in any event), each with Add to event and Remove — like the tournament directors list.
- **Remove** (director or ring manager) → the person moves to **Not assigned**: a removed tournament director can no longer create events and is taken off as director of every event (their events stay); a removed ring manager is taken out of every event and ring. From Not assigned the admin can **Make director**, **Make ring manager**, or **✕ Remove access**.
- **✕ Remove access** → **Access removed** list (name, email, date). The person is taken out of every event; on the Vercel site Firestore treats them as signed out (`blocked/{uid}`), and the app shows only "Your access was removed — Request access". Their request appears to the admin as "asks to be let back in" with **Restore access** / Decline; **Restore** (also from the Access removed list) puts them back under Not assigned. On claude.ai the app hides everything from them, and the admin should also remove them from the page's Share menu.
- App-level lists live in `meta/access` (`managers`, `unassigned`; on claude.ai also `blocked`).
- **Rules** (`firestore.rules` v1.21.0 — **redeploy**): `signedIn()` excludes blocked users; `blocked/{uid}` admin-written (the person may read their own); `orgRequests` can still be created by a blocked user; `meta/access` readable when signed in, writable by app admins.
- Verify: test/appaccess.js (emails shown; remove director/manager → Not assigned and out of events; ✕ → Access removed, blocked screen, cannot read events, request → restore → Not assigned → signs in normally; Make ring manager / Make director); full regression.

## 43. v1.22.0 — sign in with any email (not only Google); spectators don't sign in (2026-10-17)
- **Sign-in box** (Vercel site): "Sign in with Google" (Gmail / Google Workspace) **or with any email**: Email + Password + "Sign in with email" (Enter works), and **"First time here, or forgot your password? Set a password"**. The note at the bottom now says **spectators don't sign in** — they use the event's public link (the old text wrongly told spectators to sign in with Google).
- **First use / forgot password**: the app creates the account with a throw-away password if it doesn't exist yet (and signs that session out), then Firebase emails a link where the person chooses their own password; the box confirms "We emailed a link to …".
- **Confirm the address**: an email + password account must confirm its email before the tracker opens (a verification email is sent automatically; "I've confirmed — continue" / "Send the email again" / Sign out). Invitations and roles only apply to confirmed addresses — the rules require `email_verified`, so nobody can claim someone else's invitation by creating an account for their address.
- **Invitation emails** explain the right steps for the address: Gmail → "Sign in with Google"; any other address → "Set a password", then sign in with email and password (Workspace addresses may also use Google).
- Names for email accounts come from the address (sam@club.org → "Sam") until a name is set elsewhere.
- **Firebase console**: Authentication → Sign-in method → enable **Email/Password**. `firestore.rules` v1.22.0 — **redeploy**.
- Verify: test/emailsignin.js (sign-in box content; Set a password → reset email + session signed out; wrong password message; sign-in → Confirm your email gate with verification sent; invitation not applied until confirmed; confirm → signed in, invitation accepted, name from email; admin sees Sam with email); full regression.

## 44. v1.23.0 — email addresses next to names everywhere (2026-10-17)
- **Title bar** (Vercel site, wider screens): the signed-in email next to Sign out (phones: in the About pop-up).
- **Home**: event cards — "Directors: Name (email), …"; App admin — every list (directors, ring managers, not assigned, access removed, requests, admins), **Directors by event** chips and the "Add director…" menu, **Events by director**.
- **Inside events**: every person chip (ring managers on ring cards, staff, People tab) shows the email; the ring card's "Add a ring manager…" menu lists "Name (email)".
- Helpers: `personChip(id)` adds the email; `personLabel(id)` = "Name (email)" for menus and plain text.
- Verify: test/emails.js (bar, event card, Directors by event, Events by director, admin lists); regression.

## 45. v1.23.1 — "Set a password" email: visible result, clear errors (2026-10-17)
- **Locate**: on the Vercel sign-in screen, a non-Gmail user tapped "Set a password" and no email arrived.
- **Diagnose**: the request result was only shown as a short toast. A failure (Email/Password sign-in not enabled in Firebase, sign-up switched off, quota, network) disappeared in a few seconds and looked like "nothing happened"; a success gave no hint where to look (Firebase sends from noreply@<project>.firebaseapp.com, often filtered into Spam/Junk/Promotions, sometimes minutes later). The code path itself sends correctly (verified with the mock).
- **Fix**: the sign-in card now shows a lasting status box — "Sending…", then either "Email sent to … from noreply@… subject “Reset your password …” — check Spam / Junk / Promotions", with **Send it again** (30-second guard), or the exact problem with its fix and code (e.g. operation-not-allowed → enable Email/Password; admin-restricted-operation → turn on "Enable create (sign-up)"). The typed email stays in the box. The email's link now returns the person to the site after they save their password (falls back if the continue URL is refused). Console logs `[auth]` lines for support.
- Verify: test/emailsignin.js (sent notice with sender/spam/Send again, return link, too-soon resend, error shown on the card with fix and code, email kept); regression.

## 46. v1.24.0 — passwords only with an invitation code (2026-10-17)
- **Why**: Comcast (and some other providers) silently drop Firebase's emails, even when sent through Gmail SMTP; and the v1.22 "Set a password" let anyone type any email and make Firebase create an account and send mail (spam / overload).
- **Now**: an email + password account can only be created by someone holding an **invitation code**:
  - When the app admin or a director invites a **non-Gmail** address on the Vercel site, the invitation gets a random **10-character code**. The invitation email — sent by the inviter from their own Gmail / Outlook / mail app — contains the code and the steps. Only SHA-256(email:code) is stored publicly (`invcodes/{hash}`); the code itself sits in the invite, readable only by the inviter, app admins and the invitee.
  - Sign-in box: **"First time? Use your invitation code"** → email + code + new password (twice) → the app checks the hash, creates the account with the person's own password, records `claims/{uid}` (proof the address belongs to them) and signs them in straight away — **no Firebase email at all**. Wrong code / uninvited email → refused, **no account is created**. A used code is deleted when the invitation is accepted.
  - **"Forgot your password?"** only sends Firebase's reset email for an existing account (never creates one) and warns that some providers block it; otherwise the app admin deletes the account in Firebase → Authentication → Users and re-invites.
  - Gmail addresses keep "Sign in with Google" (no code). Messages stay on the card and typed fields are kept.
- **Rules** (`firestore.rules` v1.24.0 — **redeploy**): `invcodes` — anyone may `get` a hash, nobody may list, only app admins / event directors create; `claims/{uid}` — the new account may create its own claim only for its own email and an existing code hash for that email; `myEmail()` accepts a verified email **or** a matching claim.
- Limits: Firebase's sign-up endpoint itself stays open (the app needs it to create invited accounts); an account made outside the app gets no data and no roles.
- Verify: test/emailsignin.js (code in invitation, only hash public, Gmail without code, no open sign-up, uninvited/guessed code refused without creating an account, wrong code, mismatched passwords, right code → signed in without email, invitation accepted + code removed + claim recorded, used code can't reset, later password sign-in, Forgot never creates); full regression.

## 47. v1.25.0 — public link + QR code before the start; stronger person borders (2026-10-17)
- **App admin**: every person (directors, ring managers, not assigned, access removed, requests) sits in its own box with a 2px border, 8px apart.
- **Public spectator link card** on the director's Dashboard (tournaments, Vercel + Firebase site), state chip Off / Waiting for the start / ● Live / Live ended:
  - **Create public link & QR code** any time before the tournament → link (Copy, Open), QR code on screen, **Download QR code (PNG)** (event name + "Live results — scan to follow") for emails, flyers and venue posters.
  - **Before Go live** the public page shows logo, event name, dates, location and "The tournament hasn't started yet" — no tabs, no data (rules: event doc readable when shared, everything else only when shared **and** live). It switches to live by itself when the director presses Go live (same link).
  - **End live**: page says "The live results have been turned off by the tournament director"; link and QR stay valid for the next Go live. **Stop sharing** turns the link off (sharing again makes a new link/QR).
  - Go live still creates a link if none exists (as before). On claude.ai the card explains public links need the Vercel site.
- QR: vendored qrcode-generator 2.0.4 (MIT), error correction M, drawn as SVG and canvas PNG.
- **Rules** (`firestore.rules` v1.25.0 — **redeploy**): `isPublic(e)` = public && live; the event doc alone stays readable while shared (for the waiting page).
- Verify: test/publink.js (card before start, QR + waiting chip, PNG download decodes to the link, spectator waiting page, data closed until live, auto-switch to live, End live → turned off with link kept, Stop sharing → off, admin borders 2px); public.js / golive.js updated for End-live wording; full regression.

## 48. v1.25.1 — App admin card fits phone screens (2026-10-18)
- **Locate**: iPhone, App admin → "Waiting to be accepted" rows, "Directors by event" and "Events by director" ran past the right edge (page 639px wide on a 390px phone).
- **Diagnose**: invitation rows used a 3-column grid (email | Send / copy | Cancel) with unbreakable emails; the two tables kept their desktop columns; long names/emails and chips didn't wrap.
- **Fix** (CSS + invitation row markup): invitation rows use the bordered person box — email (wraps), role · code · time below, buttons on their own line. On phones (≤640px) the two tables become stacked bordered boxes; long names, emails and chips wrap anywhere; the Add-director menu is full width. Rules unchanged.
- Verify: test/adminphone.js (390px and 320px: no sideways scroll, nothing inside the App admin card past its edge); regression.

## 49. v1.26.0 — import the WTKF National Federation registration sheet (2026-10-18)
- **Requirement**: national federations return the "Informational Spreadsheet For National Federations To Complete" (title rows, COUNTRY, National Federation, contact; ATHLETES INFORMATION table: #, Last Name, First Name, Age (= birth date dd.mm.yyyy), Gender (MAN/WOMAN), Rank ("1 dan"), an X under each event (Individual Kata, Team Kata, Mixed Enbu, Man/Man Enbu, Fukugo, Individual Kumite, Team Kumite), Judges' Seminar, Participation Fee; then JUDGES/COACHES, PHOTOGRAPHER and fee totals). The director imports it as-is via Competitors → Import CSV.
- **Import rules**:
  - Heading row found anywhere (first row naming First + Last Name); title rows above give **country** (→ every athlete's country, used by the International draw to separate countries) and **federation** (→ dojo/club when no dojo column).
  - Empty numbered slots skipped; the table ends at the next section heading (JUDGES/COACHES …), which is reported as skipped.
  - Birth date from DOB or, when it holds a date, the Age column: dd.mm.yyyy, d.m.yyyy, dd-mm-yyyy, yyyy-mm-dd, m/d/yyyy (d/m when the first number > 12); impossible dates rejected.
  - One column per event marked X (Mixed / Man-Man / Woman-Woman Enbu → Enbu); the old "events" column with ";" still works.
  - ALL-CAPS names → Name Case. Fee column → fee amount.
  - Same first + last name + birth date already in the event → skipped ("already registered"), so a federation can resend its sheet.
  - **Lost accents**: names with "?" (file saved without UTF-8) are flagged with advice (Excel → Save As → CSV UTF-8). Re-importing a corrected file **fixes those names** on the existing competitors instead of adding duplicates.
  - File bytes: UTF-8 when valid, otherwise Windows-1250 for Central-European countries, else Windows-1252.
- **Preview** (Check / choosing a file): sheet type, country, federation, warnings, counts, row problems with the original value, and a table of everyone to be imported.
- Verify: test/fedimport.js (real Poland sheet: 29 athletes, country/federation, name case, dd.mm.yyyy and d.mm.yyyy dates, X events incl. both Enbu columns, fee, re-import skipped, Windows-1250 + UTF-8 Polish letters, name correction without duplicates, generic CSV unchanged); regression.

## 50. v1.27.0 — judges import reads the same WTKF National Federation sheet (2026-10-18)
- **Requirement**: Judges → Import judges accepts the federation registration sheet as-is and takes people from its **JUDGES/COACHES INFORMATION** section (Last Name, First Name, Age, Gender, Rank, Judges' Seminar Nov 18 / Nov 19, fee). Athletes and the photographer are not imported there.
- **Rules**:
  - Section found by its heading; ends at the next section (PHOTOGRAPHER INFORMATION, totals); empty numbered slots skipped. Row numbers in the preview are the sheet's own rows.
  - Country and federation from the top of the sheet → judge's country and dojo; names to Name Case; notes = "Rank 6 dan · Judges' seminar: November 18 · From the federation's judges/coaches list".
  - The sheet has **no judge levels**: rows import with kata/kumite level *not set* (shown "Kata L– / Kumite L–", not qualified, so they can't be put on a ring until the director sets levels). The judge form shows "Not set — choose a level" instead of silently defaulting to Level 1.
  - Judges and coaches share one list → every row has a tick box (all ticked); the director unticks coaches. Import button shows the ticked count.
  - Re-import: the same person (name, accents ignored) is updated, not duplicated; levels already set are kept; a corrected file (UTF-8 / Windows-1250) fixes names that had "?" ("name corrected from …").
  - Ordinary judge CSVs unchanged (credential columns still required there).
- Verify: test/fedjudges.js (2 of 2 people found, warnings, untick → Import 1, country/federation/rank, Not set levels, set levels, re-import corrects name + adds the other without duplicates + keeps levels); test/judgeimport.js updated for the tick column; fedimport.js; regression.

## 51. v1.28.0 — birth dates: day-month-year (Europe) vs month-day-year (USA) (2026-10-18)
- **Requirement**: Europe (and most countries) write dates day-month-year (27.07.2012), the USA month-day-year (07/27/2012). The separator ("." "/" "-") does not tell which — the v1.26 rule (dots = European, slashes = US) was wrong for European files with slashes and US files with dots.
- **Rule — one order per file**, decided in this order and shown in the preview with the reason:
  1. **Birth dates are** selector in the import form (Work it out · Day-month-year · Month-day-year).
  2. The file's own dates: a first number above 12 can only be a day (27.07.2012 → day first); a second number above 12 can only be a day (07/27/2012 → month first).
  3. Country: the sheet's COUNTRY or the rows' country column — USA → month first; any other country → day first.
  4. The event location names the USA (USA / United States / ", ST" state code) → month first.
  5. The director's device set to US English → month first; otherwise day first.
- Year-first dates (2012-07-27) are always year-month-day. 8 digits without separators (27072012 / 07272012) follow the file's order. Impossible dates (31.02) are rejected with the original text.
- A file mixing both orders gets a warning; rows that don't fit the chosen order are listed as problems instead of being imported with a wrong date.
- Preview shows birth dates as "27 Jul 2012" so day/month can't be misread.
- Verify: test/dates.js (proof by 27.07, proof by 07/27, USA country, Poland with slashes, override, 8 digits, mixed file, impossible date, undecided → device locale, US device, federation sheet); fedimport.js; e2e; regression.

## 52. v1.29.0 — WTKF World Championship 2026 rule set (Information Package) (2026-10-18)
- **Source**: "XXII WTKF Traditional Karate World Championship & Judges' Seminar — Information Package", Washington DC, 17–20 Nov 2026 (competition Fri 20 Nov, Springhill Recreation Center, McLean VA). §III Participants, §V Categories, §VII Judges.
- **Divisions → "WTKF Worlds 2026 rules"** opens a summary and applies the rule set (`KT.PRESETS['wtkf-worlds-2026']`, `KT.presetDivisions`):
  - **34 divisions**, black belts only (Shodan+): Cadet 14–15, Junior 16–17, Youth 18–20, Senior 21+ — each Women/Men Individual Kata, Fuku-go, Individual Kumite (24); Cadet & Junior 14–17 — Women's & Men's Synchronized (Team) Kata, Men's & Mixed Enbu (4); Youth & Senior 18+ — Men's & Women's Synchronized Kata, Men's & Mixed Enbu, Men's & Women's Team Kumite (6). No Women's Enbu; no Cadet/Junior Team Kumite.
  - **Ages by birth year**: event "ages as of" = 31 Dec 2026 (born 2011–12 = Cadet, 2009–10 Junior, 2006–08 Youth, ≤2005 Senior); stored ages recalculated.
  - **Kumite type**: Cadet/Junior Individual Kumite & Fuku-go = Ko-go; Youth/Senior = Jiyu (Shobu Ippon).
  - **Team sizes per division** (`dv.teamSize`, `KT.teamSizeFor`): Synchronized Kata 3; Enbu 3 (Cadet & Junior) / 2 (Youth & Senior); Team Kumite 3 + 1 reserve (3–4). Team save checks the size of the team's division. Enbu stays 2 by default; only the division setting changes it.
  - **Quota per National Federation** (`dv.quota`, `KT.quotaIssues`): 3 athletes per individual category, 1 team per team category, counted by country (International). Shown as "Over quota · Poland 4/3" on the division and as a (non-blocking) go-live checklist item "Quotas and team sizes" — the director decides who is withdrawn.
  - **Judges**: Class A(6)/B(5)/C(4) → event `judgeMin` = 4 (new "Minimum judge level" in Event settings; `KT.judgeNeed(level, min)`).
  - Event set to International (draw keeps same-country athletes apart), all six events offered.
  - Other divisions not in the rule set are removed (option, only if not drawn); same event/gender/age-group divisions are updated (ages, rank, quota, team size, kumite type) keeping ring, format, bronze and timing; drawn divisions are never touched. Brackets are not drawn by this step.
- **Ambiguities in the package (as implemented, director can edit any division)**: the 16–17 group is titled "YOUTH" on p.7 but "JUNIOR" in the combined table on p.8 and §III lists "seniors, youth, juniors and cadets" → named **Junior**. Cadet/Junior Enbu is listed as "1 Team (3 athletes)" while Youth/Senior Enbu is 2 → kept as written (3).
- Verify: test/worlds2026.js (pop-up, 34 divisions only, event settings, age limits, Ko-go/Jiyu, team sizes, no Women's Enbu, Shodan-only + quotas, Poland sheet: Janusz born Dec 2005 → Senior by birth year, Bis 2006 → Youth, Simona 2012 → Cadet, Kisiel 2010 → Junior; over-quota flag + checklist; kyu athlete unplaced; 2-member Cadet/Junior Enbu refused, 3 accepted; judge level 4 shown); regression.

## 53. v1.30.0 — choose who competes when a country is over quota; no draw while over quota (2026-10-18)
- **Choose**: on a division that is over its quota (e.g. WTKF 2026: 3 athletes / 1 team per country), the status shows **"Over quota: Poland 4/3 · Choose ›"** (instead of "Ready to draw"). Tapping it lists that country's entrants in the division (rank, age, other events) with tick boxes; Save is enabled only when exactly the quota is ticked ("tick 1 more" / "untick 1").
  - Athletes not chosen lose **that event only** (removed from their events, override cleared) — they stay registered and keep their other events. Teams not chosen are marked Withdrawn.
- **Draw blocked**: Draw / Save & draw / Redraw on an undrawn over-quota division is refused with the reason and opens the picker. **Draw all ready** draws the others and lists the over-quota divisions it skipped (confirm dialog + toast). Divisions already drawn are not affected (the chip there is information only).
- Verify: test/worlds2026.js (draw refused + picker opens, 4 listed, Save only at exactly 3, unticked athlete keeps registration but loses the event, flag cleared, division draws, Draw all warns and leaves over-quota divisions undrawn, table fits at 1280px, no sideways scroll at 390px); regression.

## 54. v1.30.1 — go-live checklist: an empty event no longer passes (2026-10-18)
- **Locate**: Dashboard → "Ready to go live?" on a new event with no competitors, judges or managers showed ✓ "Each ring has a full judging panel", ✓ "Every ring has a ring manager", ✓ "Rings, managers and helpers ready".
- **Diagnose**: those checks (and "Every division is on a ring") only looked at *rings in use* (rings holding a division with competitors). With no competitors there are no rings in use, so "no ring is missing anything" was true for an empty list — nothing to check was counted as done.
- **Fix**: each ring check now also requires at least one ring in use (and "Every division is on a ring" requires a division with competitors). When there is nothing yet, the item stays ✗/! and says why: "No divisions set up yet" / "No division has competitors yet" / "No rings set up yet" / "No ring has a division with competitors yet"; competitors and judges items say "No competitors registered yet" / "No judges added yet" / "No judges assigned to a ring yet".
- Verify: test/emptychecks.js (new empty tournament: no item ticked, reasons shown, Go live disabled); golive.js, public.js, worlds2026.js; regression.

## 55. v1.31.0 — NCR kyu rules for local & regional tournaments (2026-10-18)
- **Source**: "Traditional Karate North Central Region (AAKF) — Tournament Rules for Kyu Rank Competitors (youths & adults)", v3.3, Oct 2022.
- **Divisions → "NCR kyu rules"** (`KT.ncrDivisions`, `KT.NCR_KYU`) creates kyu divisions by level:
  | Level | Ranks | Allowed kata | Kumite |
  |---|---|---|---|
  | 1 | White belt (10th), 9th, 8th kyu | Heian Shodan, Heian Nidan | 4 exchanges (oi-tsuki jodan, chudan per side), no points, Court Judges' flags; contact → Han-soku |
  | 2 | 7th, 6th kyu | Heian Sandan, Heian Yondan | 6 exchanges (+ mae-geri chudan), flags; warning then Han-soku for contact |
  | 3 | 5th, 4th kyu | Heian Godan, Tekki Shodan | 6 exchanges (tsuki / geri / ippon waza), Waza-ari only, Saki 2 / Chui 4 to opponent, points decide, tie → Hantei |
  | 4 | 3rd–1st kyu | Bassai Dai, Jion, Empi, Kanku Dai | WTKF Ko-go Kumite |
  - Events: Individual Kata, Individual Kumite, Team (synchronized) Kata, Enbu (options per event).
  - Youth (≤17) / Adult (18+) and Women / Men separated by default; the rules allow mixing when a pool is too small and coaches agree → options create **Open** divisions (new `dv.open`: any gender; same-gender divisions are preferred when both fit) and/or no age split.
  - Individual events: round robin **pools of up to 6** (new division setting "Round robin: pool size", `dv.rrPoolSize`; 7 → pools of 4 + 3) or double elimination; Individual Kata head-to-head with **flags, 3 judges** (option 5). Team kata / Enbu: scored (score pools), highest total wins.
  - Running order: kata divisions before kumite within each level and age group (ring order).
  - Existing kyu divisions not drawn are replaced (option); black-belt divisions never touched; event offers the chosen events.
- **Scoring**: new kumite styles `ncr1` / `ncr2` / `ncr3` (`KT.ncrEval`) with a guided sheet: exchange "n of 4/6", the Shu-shin's call ("Aka jodan tsuki — hajime"), attacking/defending side, "Exchange done · next", then Hantei buttons (L1/L2, L3 on a tie); L3 Waza-ari does not end the exchange (each side has 2 chances to score); Saki disabled for the attacker. Officials for NCR kumite: Shu-shin + 2 (or 4) Fuku-shin, no Kan-sa. Styles can also be chosen on any kyu kumite division.
- **Allowed kata** (`dv.kataList`, editable in division settings): shown on the head-to-head kata sheet with a picker per side limited to the list; the chosen kata are stored with the result and shown on the record.
- Rank import understands "White belt" / "White" / "Mukyu" (= 10th kyu).
- Fix found on the way: editing a division in Division settings dropped preset fields (quota, team size, preset) — now kept.
- Verify: logic.test.js (NCR divisions, open/mixed preference, L1/L2/L3 exchange logic and points, RR pool size 6 / default 4); test/ncr.js (pop-up, 48 divisions, black belts untouched, kata before kumite, white belt import, 7 → pools 4 + 3, allowed-kata picker, 3 flags, L1 sheet → Hantei → confirm, 3 officials, L3 points); regression.

## 56. v1.32.0 — each event's own kyu rank groups and kumite exchanges (2026-10-18)
- **Requirement**: other regions group kyu ranks differently and use different kumite exchanges; for kyu ranks (1st kyu and below) the winner is decided by the Court Judges' flags.
- **Divisions → Kyu rules (NCR) → "Edit rank groups & exchanges…"**: one card per level — name, lowest and highest kyu rank (White belt / 10th … 1st), allowed kata, **winner decided by** (Court Judges' flags — default for new levels; Waza-ari points with a tie → flags; WTKF Ko-go), and the **exchange list** (one technique per line; Aka attacks through the list, then Shiro). Add level / Remove level / Reset to NCR v3.3. Saved on the event (`ev.kyuGroups`; empty = NCR v3.3).
  - Checks (`KT.kyuGroupsCheck`): a name, kyu ranks, lowest ≤ highest, no rank in two levels, at least one exchange unless Ko-go → refused with the message; ranks in no level → warning ("competitors with these ranks get no division").
- **Create kyu divisions** uses the event's levels (`KT.ncrDivisions({ groups })`): kumite divisions get style `kyux` with their own `exchanges` and `decide`; kata divisions their allowed kata.
- **Scoring** (`KT.kyuEval`, generalizes the NCR engine): exchange n of 2 × list, the call "Aka <technique> — hajime", attacker/defender, then Hantei by flags (flags levels have no point buttons — Warning and Han-soku for contact). Levels left exactly as NCR keep the NCR instructions and buttons.
- **Division settings**: kyu kumite divisions can switch to "Kyu exchanges (list below)" and edit that division's list and decision.
- Verify: logic.test.js (custom groups → divisions, exchange order Aka then Shiro, flags-only ignores points, validation: reversed / overlap / no exchanges / gaps); test/kyugroups.js (editor: rename, re-range, remove keeps edits, Ko-go → flags shows list, overlap refused, saved on event, rules window shows the event's levels, 36 divisions, all flags, sheet calls the custom exchanges and ends in Hantei, division-level edit, reset to NCR clears the list); ncr.js; regression.

## 57. v1.33.0 — WTKF charts for National & International tournaments (2026-10-18)
- **Sources**: "Competition Drawings" (WTKF rules book appendix: Exhibit A kata/en-bu elimination chart p.119, Exhibit E kumite single elimination chart p.117, Exhibit F fuku-go chart p.120, Exhibits B–D scoring records), "Charts for Kumite" parts 1–4 (Exhibit E filled in by hand for 1 … 24+ participants) and "Flow Chart Explanation".
- **When**: automatically for single-elimination and kata-score-pool divisions at **National and International** events; per division "Draw chart": Automatic / WTKF charts / Standard draw.
- **Kumite, Team Kumite, Fuku-go — Exhibit E/F** (`KT.wtkfSlots`): one elimination chart in four pools **A-1, A-2 ("A" bracket) and B-1, B-2 ("B" bracket)**; pool winners → A / B semi-finals → final.
  - Pool sizes as equal as possible; entrants beyond an even split go to **A-2, B-2, B-1, then A-1** (byes the other way) — matches every handwritten chart (5: 1/2/1/1 … 13: 3/4/3/3 … 21: 5/6/5/5 … 24: 6/6/6/6). Chart size 1, 2, 4, 8, 16, 32, 64.
  - Byes inside a pool go to the top match of each half first (5 in 8 → matches 1–3; 6 → 1 and 3; 7 → 1), as drawn.
  - Previous championship (seeds 1–4): **1st A-1, 2nd B-1, 3rd B-2, 4th A-2**, top of the pool, bye first.
  - Same country / club: spread as equally as possible over the four pools (and A/B sides), not meeting in the first match unless unavoidable.
  - **View**: "A" bracket left (A-1, A-2 pools, First round → Semi-final), Final centre, "B" bracket mirrored right; fuku-go columns marked (Kumite)/(Ki-tei).
- **Kata, Team (synchronized) Kata, En-bu — Exhibit A** (`KT.wtkfKataCharts`, `KT.kataChartCount`): charts of **at most 12**, number of charts **1, 2, 4, 6 …** (never 3): 29 → 4 charts 7/7/7/8, 54 → 6 × 9; same country spread over the charts.
  - Previous winners at the bottom (perform last): one chart 4th, 3rd, 2nd, 1st; two charts — chart 1: 4th, 1st · chart 2: 3rd, 2nd; four charts — 4th → chart 1, 1st → chart 2, 2nd → chart 3, 3rd → chart 4 (6 charts: 4th → 1, 1st → 2, 2nd → 4, 3rd → 5 — extended by the same pattern).
  - Top 4 of each chart advance; **neighbouring charts merge** (1+2 | 3+4 → 2 groups of 8; 1–3 | 4–6 → 2 groups of 12); then **final elimination of 8**, then **final of 4**. Charts / groups are labelled "Chart n" / "Group n".
- Fix found on the way: the draw crashed when no random source was passed (now defaults).
- Verify: logic.test.js (pool sizes and empty-match check for 5–24 vs the handwritten charts, bye positions, champions' pools, country spread over 15 draws, kata chart counts/sizes, champions' charts, merging A+B / C+D into 8s); test/wtkfcharts.js (International demo: Draw chart option, seeds hint, 26 entrants → pools 6/7/6/7, champions in A-1/B-1/B-2/A-2, mirrored chart view, kata 32 → 4 charts of 8, standard draw on request); regression.

## 58. v1.33.1 — kata averages to 3 decimals (2026-10-19)
- Kata / team kata / en-bu score averages (judges' scores, highest and lowest dropped with 5+ judges) are shown to **3 decimals** (e.g. 7.567) everywhere: score sheet, score-pool tables, head-to-head score result ("Score 7.567–7.467"), ring "On the mat" / public status, scorer toast. Ranking still uses the exact totals (then all scores), so no placing changes.
- Verify: logic.test.js (3-decimal method text and average); regression.

## 59. v1.34.0 — competitor import: take what is there, flag what is missing, preview everything (2026-10-19)
- **Requirement** (local tournaments' sign-up sheets): scan the file, import every recognised column even when others are missing, flag the missing information for manual entry later, and show all data that will be imported before committing.
- **Column scan** (shown after Check): **Columns found** (field ← file heading, e.g. "Rank ← Belt", "Dojo / club ← Club", "Emergency phone ← Parent Phone"), **Not in the file — enter later** (Name parts, Gender and Date of birth for tournaments, Rank, Dojo / club, Emergency contact, Waiver, Events for tournaments), **Not used** (unrecognised headings, e.g. T-shirt size).
- **Names**: First/Last name columns, or **one name column** ("Name", "Competitor", "Athlete", "Student", …) split as "Last, First" or "First Last". A file without any name column is refused with a clear message. More heading aliases: Born, Kyu, Belt rank, Parent / Guardian (name, phone), FName / LName.
- **Rows**: every row with a name is imported (only empty rows and rows without a name are left out — the latter reported "Row n: no name — not imported"). Missing or unreadable values are not guessed: they are left empty and listed per competitor ("Rank (“Yellow” not recognised)", "Date of birth (“31.02.2012” is not a date …)"). Previously such rows were skipped.
- **Preview table** (wide pop-up, scrolls into view after Check): #, Name, Gender, Born, Rank, Dojo / club, Country or State, Events, Emergency, Waiver and **Needs later**; empty required values show "missing"; incomplete rows marked on the left. Summary "N competitors ready to import — M with details to enter later".
- **After import**: incomplete competitors carry the existing **Incomplete** tag; the Competitors list switches to the **Missing information** filter and the toast says how many need details. Applies to every event (local sign-up sheets were the trigger; the federation sheet works as before).
- Verify: test/lenientimport.js (one name column split both ways, columns found / missing / not used, all values shown with "missing", unrecognised belt flagged with its text, no-name row reported, 3 imported with what the file had, list switches to Missing information, no-name-column file refused, no date notice without dates); dates.js updated (bad dates now imported and flagged instead of rejected); fedimport.js; regression.
- Test harness fix (found while verifying): the Firebase mock (test/fbmock.js) re-parsed its whole database for every permission check (`uid()` → `JSON.parse`), so with two demo events a page could stall for minutes — the cause of the earlier "flaky under load" Firebase tests. It now parses each stored version once. App code unaffected; full suite (42 files) passes in parallel.

## 60. v1.35.0 — typed birth year; entrants open their card; combine small divisions (2026-10-19)
- **Birth date typing** (fix): the competitor card used the browser date picker, which on some phones / browsers only scrolls and won't take a typed year. It is now a text field "Date of birth · MM/DD/YYYY" (or DD/MM/YYYY — same order rules as the import: event in the USA or a US-English device → month first, else day first; YYYY-MM-DD and 8 digits also accepted). A live line underneath reads it back ("= July 27, 2012 · age 14 on …", "Keep typing the year (4 digits)…", "Not a date yet"); an impossible date is refused on Save with the expected format.
- **Entrants open their card**: in Division settings (Entrants & seeds) and in the division panel (new "Entrants" list) every name is a button that opens the competitor (or team) card, where the division for that event can be changed (Auto or a chosen division).
- **Minimum 3 per division — combine** (`MIN_DIV = 3`): an undrawn division with 1–2 entrants shows "n entrants · min 3 · Combine ›" in the Divisions list, and a notice in its panel / settings. **Combine** lists the other divisions of the same event, closest first (same gender, nearest age group and ranks; drawn ones last), shows the new total (and warns: still under 3, different gender, already drawn → redraw), and moves every entrant there (competitor: division set on their card for that event; team: its division), then deletes the empty division (option). The target keeps its name, ages and rules and shows "incl. <old division>".
- Verify: test/combine.js (typed date: format shown, partial-year hint, July 27 2012 · age 14, impossible date refused, saved ISO, YYYY-MM-DD accepted; 2-entrant division chip, panel entrants + notice, name → card with division choice, Combine suggests Junior Men Kata, source removed, both entrants moved, "incl." label, Division settings names open the card); regression.

## 61. v1.36.0 — bulk remove a group of competitors (to re-import a corrected file) (2026-10-20)
- **Competitors → Remove group…** (directors): pick one group —
  - **From an import**: every import is now tagged on the competitor (`importId`, `importName` = file name or "Pasted list", `importAt`), listed newest first, e.g. "wtkf-federation-sheet.csv · Oct 20, 2:45 PM (29)";
  - **Dojo / club / federation**, **State / region**, **Country** (with counts).
- Everyone in the group is listed with a tick box (all ticked; Tick all / Untick all; "Remove N"). A competitor with any **recorded result** (match result or kata score) is shown "has results — kept" and cannot be removed; one already in a drawn bracket is marked "in a drawn bracket" (that bracket shows "Entrants changed" afterwards).
- Confirm → deletes each registration and its private details in this event, takes them off teams (a team left empty is deleted); the list returns to "All" and the toast suggests importing the corrected file. Re-importing then adds them again (people still registered are skipped as before).
- Rules unchanged (directors already delete competitors, private details and teams of their events).
- Verify: test/rmgroup.js (29 imported and tagged with the file name; groups offered by import / federation / region / country; 29 listed; untick one → Remove 28; confirm; 28 and their private details deleted; corrected file re-imports 28; scored competitor locked and kept when removing a dojo; drawn-bracket note; teams cleaned, empty teams deleted); regression.
