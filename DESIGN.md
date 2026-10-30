# Karate Event Tracker · v1.56.0 Requirements & Design

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

## 62. v1.37.0 — International events keep only the year of birth (2026-10-20)
- **Why**: EU GDPR Art. 5(1)(c) data minimisation (personal data "adequate, relevant and limited to what is necessary") and 5(1)(e) storage limitation; WTKF international ages are by birth year (age on 31 Dec, e.g. 31 Dec 2026), so day and month are not needed. Many entrants are minors (Art. 8 gives children's data particular protection). Not legal advice.
- **Scope**: events with level **International** only. US national, regional and local events keep full dates (day/month order rules unchanged).
- **Import**: the 4-digit year is taken from the date / "Age" column (any order or separator; even an impossible date like 31.02.2008 gives 2008) or from a new **Year of birth** column (Year of birth / Birth year / YOB / Year born); day and month are never stored; no date-order question; preview shows "International event — year of birth only" and "Born (year)". Duplicate check by name + year + country (or dojo), so two athletes with the same name and birth year from different countries are both kept.
- **Storage / age**: private `birthYear` (dob empty); `KT.ageOf` → event year − birth year (`KT.ageFromYear`); public `age` field computed the same; validation accepts a year.
- **Competitor card**: "Year of birth" (4 digits) with "Born 2011 · age 15 in 2026 (on 31 Dec)".
- **Existing data**: Competitors tab shows "N competitors have a full date of birth stored … **Keep year only**" → deletes day and month (keeps the year), ages unchanged.
- **Export**: `birth_year` column instead of `dob`.
- **Also**: Export CSV on the Vercel site (and local file) now downloads the file directly (with a BOM so Excel shows accents) instead of showing a copy box; claude.ai keeps its download prompt.
- Verify: test/yob.js (Keep year only on the international demo; import of dd.mm.yyyy / mm/dd/yyyy / impossible date / blank → 2012, 2010, 2008, missing; stored year only, age 14; card year field, age 15; export birth_year downloaded as a file; local event still full dates); worlds2026, fedimport, dates; regression.

## §63 Kata performance order & ring call (v1.38.0)
**Requirement.** Kata pools perform in the reverse of the ranking: entrants without a rank go first in random order, then ranked entrants from the lowest rank to the highest (rank 1 last). The order is set automatically when the division is drawn. The director assigns divisions / pools / rounds to rings (unchanged). The ring manager works the ring's queue: announce (call) the next match or performance, verify the competitors are at the ring and ready, then start it.

**Design.**
- `KT.kataOrder(list, rnd)` — unseeded shuffled, then seeded by descending seed. Used for KP finals (≤4), standard pools and WTKF charts (all seeds now, not only 1–4). The rank is the division seed. Later rounds keep the score rule (lowest score first).
- Ring call stored in `live/<ev>/ringstate/<ring>.call = {did, mid|kp, n, present:{a,b}|{c}, at, by}` — no rule change (ring managers already write their ring state). Score pushes keep a call for a different item (`keepCall`).
- Mat tab ring card: "📣 Call to <ring>" for the first queued item not on the mat → announcement text (ring, division, round/pool, Aka/Shiro or kata competitor with dojo, on deck) with "Read aloud" (speech synthesis), "Call again" (counts calls; after 3, Ki-ken hint), "Cancel call", one "present & ready" tick per competitor. "Start" unlocks when all are ticked and the mat is free; it puts the item on the mat and opens the scoresheet / score card.
- Spectators see a "Called" line under the ring's "On the mat".
- Queue "Score" buttons remain as an override (e.g. director out of order).

**Verify.** logic.test: kataOrder, KP final / pools / WTKF charts order. test/ringcall.js: call, announce, on-deck, recall count, check-in gating, spectator line, start → on the mat, calling ahead while busy, cancel, phone width.

## §64 Kata rounds ≤12, 3rd place before the final, ring manager default (v1.39.0)
**Requirement.** Kata pool of 9–12: round 1 → top 8 to the semifinal → top 4 to the final. 5–8: round 1 → top 4 to the final. The final kata must differ from the previous round's kata. In every bracket the 3rd-place match runs before the championship (1st & 2nd). A ring manager should have one place to run their ring.
**Design.**
- `generateBracket` KP: ≤12 entrants → one first-round pool (above 12 the pool size setting still applies). `kpState`: a single pool of more than 8 is an elimination round with cut 8 whose advancers form the semifinal pool; a single pool of ≤8 is the semifinal (cut 4). Also for WTKF single charts. Kata change rule (`kpKataCheck`, WTKF Kata 2-2-B) already blocks a final kata equal to the semifinal kata (not for Enbu).
- `readyMatches`: championship matches (grand final, playoff final, main bracket final — not pool finals of pooled brackets) are held out of the queue while a bronze match (stage B) or the DES repechage final (3rd/4th) is still pending or ready.
- Mat tab: a ring manager with exactly one ring opens on that ring (until they pick another in the ring selector).
**Verify.** logic.test: 9/10/12 → pool, semi(8), final(4); 5/8 → semi, final; WTKF 11; final kata check; SE bronze before final; DES repechage final before final.

## §65 Fix: events and people missing after v1.39 deploy (v1.39.1)
- **Locate**: after v1.38–v1.39 was pushed, the Vercel site showed no events and no users.
- **Diagnose**: commit 556ac2c replaced `vercel/firebase-config.js` with the example template (`window.KT_FIREBASE_CONFIG_EXAMPLE`, `YOUR_PROJECT`). With no `window.KT_FIREBASE_CONFIG` the app silently fell back to local mode (this browser's empty storage). The data in Firebase project `karate-event-webapp` was never touched.
- **Fix**: `vercel/firebase-config.js` restored from v1.37. On a real web host (not a file or localhost / *.localhost / *.test) with the Firebase build loaded, a missing or placeholder config now shows the sign-in screen's "not connected to your Firebase project" notice (sign-in disabled) instead of local mode, saying the data is safe in Firebase. Release check `test/config.js` (now part of `npm test`) fails if the config file is not the real project.
- **Verify**: test/config.js; test/hosted.js (vercel.app with example file / no file / placeholders → notice, no local mode; development host → local mode allowed); unit 133; signin, fb, e2e, ringcall, public, access, emailsignin, about.

## §66 Mat card: ring name, not ready by default, ring manager checklist (v1.40.0)
**Requirement.** On the Mat tab each readiness card names its ring. A ring (mat) is **Not ready** by default. The ring manager completes a checklist, then taps "Ring is ready".
**Design.**
- `KT.RING_CHECKS` (7 items: mat laid out, judges seated with flags, scoreboard/timer/scoresheets, scorekeeper & timekeeper, Aka/Shiro belts, first aid, running order & first call), `KT.ringChecksDone`, `KT.ringReadyOk`.
- Stored in `live/<ev>/ringready/<ring>.checks = {key: true}` next to `ready` and `helpers`. No rule change (ring managers already write their ringready doc).
- `ringIsReady(rid)` = `ready` **and** every item ticked. An older doc with `ready` but no checklist reads as Not ready. Used by the readiness card, the mat card and the go-live check "Rings, managers and helpers ready".
- Readiness card (`ringReadyHTML(r, named)`): on the Mat tab the heading is "<Ring name> · Before the start". It shows the checklist with an n/7 count. "Ring is ready" stays disabled until all items are ticked (with a hint). Unticking any item sets the ring back to Not ready.
- Mat ring card: before going live, staff see a Ready / Not ready chip beside "N waiting".
**Verify.** logic.test (ring checklist). test/matready.js (desktop and 390 px: ring name labels, Not ready default, checklist gating, tap → Ready on both cards, untick → Not ready, no horizontal scroll). golive.js updated to tick the checklist. e2e set, ringcall, matnow, emptychecks.

## §67 Operations: bracket from the mat and back; kata bracket shows kata + score beside each name (v1.41.0)
**Requirement.** From a mat card, open the bracket of the current division and come back to the match. In kata brackets, show each competitor's score for the match/performance next to their name, with the kata used.
**Design.**
- Mat ring card: "📋 View bracket" opens the bracket of the division on the mat (or else the called item's division, or else the first queued one). Scoresheets (head-to-head score sheet, kata score card, match view) get a "📋 Bracket" button in their sub-title.
- `openBracketFrom(back, did)` keeps `S.ui.back = {ring, sel, picked, modal?, clock?, label}`. The Brackets page then shows "← Back to <ring>" or "← Back to match" at the top and the bottom. `back-match` returns to the Mat tab with the same ring filter. It reopens the same scoresheet when one was open (drafts are kept, so a typed kata or entered scores are still there) or scrolls to the ring card. Opening any tab normally clears it.
- Kumite clock: leaving a scoresheet for the bracket pauses the bout clock. Coming back restores the time left (toast: "Clock paused… Start to resume"). Without this, reopening would reset the clock.
- Head-to-head kata (flags or scores; e.g. junior round robin, kyu): each side's kata can always be recorded. It is a list pick when the division has an allowed-kata list (NCR), otherwise free text with WTKF suggestions. It is stored in `result.detail.kata` for both methods. `bmHTML` shows the kata under the name and the score beside it (flags count; scores to 3 decimals).
- Kata score pools (KP) table: the competitor cell shows "<kata> <score of this performance>" under the name (the separate Kata column is folded in). The Score column keeps the total. The performance on the mat is highlighted.
**Verify.** test/bracketback.js (mat card → bracket → back; Brackets tab opened normally has no back bar; KP and head-to-head kata show kata + score; score card → bracket → back reopens it with the typed kata; kumite clock kept and paused; phone width). Unit 134; e2e set, ringcall, matnow, matready, v117, winner, timeup, wtkfcharts.

## §68 Kata change rule only between the final elimination round and the final four (v1.42.0)
**Requirement.** The kata in the final elimination round (the round before the final four, i.e. the semifinal of 8) must be different from the kata performed in the final four round, and its score is carried forward to the final. Otherwise a round's kata does not have to differ from the previous elimination round's.
**Design.**
- `kpKataCheck`: the only kata-change check (besides Kettei-sen, which still needs a different kata than the tied performance) is for the final round when it carries the semifinal score (`st.final.carried`). The final four performer's kata must differ from their final-elimination kata. The semifinal no longer has to differ from the round before it, and no earlier elimination round has to differ from its previous round. With 4 or fewer entrants there is a single final round and nothing to compare.
- The carry is unchanged: final total = final elimination (semifinal) score + final score.
- Texts: KP bracket description; the final score card names the final-elimination kata and the carried score; the semifinal score card says its score is carried to the final four and any kata may be used.
**Verify.** logic.test (10 entrants: semifinal may repeat R1 kata, final may not repeat the semifinal kata, carry = semifinal score; 16 entrants (several pools → semifinal): same; 4 entrants: no check). e2e (semifinal same kata allowed, final same kata blocked), v15, v117, cloud, fb, wtkfcharts, worlds2026, bracketback and the rest of the e2e set.

## §69 Previous kata beside the competitor on the mat; kata bracket newest round first (v1.43.0)
**Requirement.** On the mat card and the scoresheet, the competitor on the mat shows the kata they used in the previous round and its average score, next to their name. The kata bracket shows the current round first, then the previous rounds from the most recent to the earliest.
**Design.**
- `KT.kpPrevious(br, key)` → `{ n, label, kata, avg, hansoku }` for the competitor's previous performance: the previous round, or for a Kettei-sen the tied performance in the same round. `avg` is the kata average (kept scores / kept judges, 3 decimals). It returns null in the first round.
- `prevKataHTML` / `kpPrevHTML` / `h2hPrevHTML` (app2_views): "Semifinal: *Bassai Dai* · 6.900" under the name, or Han-soku. It is shown on the mat card's "on the mat" item and on the kata score card's competitor block. For head-to-head kata, each side's latest finished match in the division (by result time) shows its kata and score (flags count, or scores to 3 decimals) on the mat card and the scoresheet corners.
- `kpViewHTML`: the round sections are built in order, then output reversed, so the final (or the last round reached) comes first, marked "· current round" while unfinished.
**Verify.** logic.test (kpPrevious: final → semifinal kata + avg, semifinal → elimination round 1, round 1 → none, Kettei-sen → tied performance). test/prevkata.js (5 entrants: bracket shows Final · current round then Semifinal; final score card and mat card show "Semifinal: Bassai Dai · 6.900"; first round: current round first, no previous line; phone width). e2e set, ringcall, matnow, matready, bracketback, v117, winner, timeup, wtkfcharts, worlds2026.

## §70 Division settings: list entrants by name A→Z / Z→A, or by club / region / country (v1.44.0)
**Requirement.** In division settings, the entrants can be listed by last, first name ascending or descending, or grouped by club, region or country.
**Design.**
- `KT.ENT_SORTS` / `KT.sortEntrants(list, mode)`: modes `name` (last, first A→Z, case-insensitive; the default), `name-desc` (Z→A), and `club` / `region` / `country` (group A→Z, entrants with no group last, then name A→Z). Teams sort by team name.
- `sortedEntrants` (app1_core) maps an entrant to its club (dojo), region (state) or country through `entGroupLabel` with the matching level. The choice is `S.ui.entSort`, remembered on this device (localStorage `kt-entsort`, read in try/catch).
- Division settings form: a "Sort entrants" select above Entrants & seeds; group modes add a heading per club / region / country ("No club" etc. for blanks). Changing it re-orders the rows in place (`reorderEntRows`), so seeds typed but not yet saved stay with their entrant. The select has no `name`, so it is not saved with the division.
- Division panel: the same select; entrant chips follow the order (with group headings). Changing it there re-renders the panel.
- Test fix: golive.js ticks the ring checklist one item at a time and waits for each tick (re-render race).
**Verify.** logic.test (sortEntrants). test/entsort.js (national demo, desktop and 390 px: A→Z default, Z→A, typed seed kept when re-ordering, club and region headings in order, country, panel follows the choice and re-renders, no horizontal scroll). e2e set, combine, divorder, rmgroup, worlds2026, fedimport, touchselect.

## §71 Rank mark "*N" after a ranked entrant's name in a drawn division (v1.45.0)
**Requirement.** When a contestant's name is displayed for a drawn division, put an * and their rank number next to the name, everywhere it is displayed.
**Design.**
- Rank = the division seed (as in §63). `generateBracket` now stores the seeds the bracket was drawn with (`br.seeds = {id: n}`). Brackets drawn before v1.45 fall back to the division's current seeds.
- `entSeed(id, did)` / `entName(id, did)` (app1_core): with a drawn division, a seeded entrant's name becomes "Last, First *N" (teams: "Team name *N"). Without a division, or before the draw, the name is plain.
- Every name shown for a division passes it: bracket boxes, pools and standings, kata pool tables, podium and Results, mat card (on the mat, up next, call panel, spectators' "Called" line, announcement text), scoresheets and score cards (corners, kata fields, winner banners, toasts, match view), division panel and settings, combine form, tiebreak order, and Follow status lines ("vs …", "lost to …"). The scoresheet panels take it from the open sheet (`mDid()`).
- "Read aloud" speaks "*2" as ", rank 2".
- Not marked: lists without a division (Competitors, Teams, attendance, Follow search) and the results CSV export (data, not display).
**Verify.** logic.test (bracket stores seeds; KP; none). test/rankmark.js (junior kata round robin: no mark before the draw; after the draw the bracket shows "*1" / "*2" only on the ranked names; scoresheet; mat card on the mat; division panel; settings list; Competitors tab unmarked; a drawn division without seeds unmarked). Full e2e set and the other browser tests.

## §72 Teams by division; duplicate an event; each person's view kept on their own device (v1.46.0)
**Requirement.** Teams tab: sort teams by division. An option to duplicate an event with all its settings, competitors, judges, divisions, etc. Each user's current view and sorting, per card, is their own, so changing it never changes the view of another concurrent user.
**Design.**
- **Teams:** each team-event card has "By division" (default) / "By team name A→Z". By division groups the teams under a heading per division, in the Divisions-tab order (`divSortCmp`), with "No division" last, then by name.
- **Per-user view:** `VIEW_KEYS` (tab, filter, divFilter, ring, ringPicked, bracketDiv, session, divOrder, teamSort) are saved on every render to localStorage `kt-view-<event>` (in try/catch) and restored by `openEvent`. Nothing about the view is written to the shared data.
  - The Divisions-tab order (groups, age groups, kyu ranks) used to be saved on the event document, so one director's choice re-sorted everyone's list. It is now `S.ui.divOrder`, available to every role. An order saved by an older version is only the starting point.
  - The kata entrants sort (§70) was already per device.
- **Duplicate event** (Event settings → "Duplicate…", for people who can create events): name (default "<name> (copy)"), start and end date, "Keep check-in, payment and waiver status" (off: competitors start not checked in, unpaid, no waiver; judges not checked in), and "Also copy the drawn brackets and results" (off).
  - Copied with the same document ids, so every link still holds (division ring, team members, seeds, ring managers): the event settings, rings, divisions, competitors with their private details (`pv/`), teams, judges and sessions. The directors are the original directors plus the person copying. `copiedFrom` records the source.
  - Not copied: live / public link, lock and archive approval, ring readiness, ring state (on the mat, calls) and attendance.
  - Firestore: the event is created first (`isOrganizer` and own uid in `directorIds`), then its documents as an event director. No rule change.
**Verify.** test/dupview.js (teams grouped by division, then A→Z by name; the sort is kept in this browser's view and the shared event is unchanged; another person (same data, no saved view) sees the default order; reload restores tab and sort; duplicate: dialog, the copy opens, competitors and private details, judges, divisions (not drawn), rings and teams copied, check-ins reset in the copy only). divorder.js. Full e2e set and the other browser tests.

## §73 Team cards fit a phone; team member list sorted by country / region / club with the team already assigned (v1.47.0)
**Requirement.** Teams card: fit the width of a mobile device. In the team's competitor list, sort by country / region / club / dojo, and show the name of the team a competitor is already on.
**Design.**
- **Teams tab:** the three-column table is replaced by one stacked row per team: name (with "No division" / "Withdrawn" chips and ›), club, then members on their own line. In "By team name" mode the division name is shown too (in "By division" mode it is the group heading). Rows wrap long names and never widen the card. The card header wraps on narrow screens. Rows are buttons (Enter / Space open them).
- **Team editor members:** a "Sort competitors" select: By country / By region / By club / dojo / By name A→Z. The default follows the event's separation group (International → country, National → region, otherwise club). Group modes add a heading per group ("No country" etc. last), then A→Z by name (`KT.sortEntrants`).
  - Each competitor is two lines: name, then country · region · club (de-duplicated) · gender · rank.
  - A competitor already on another team of the same event shows a chip "On <team name>" (several names if on more than one).
  - Re-sorting moves the rows in place, so ticks stay. The choice is part of the person's own view (`teamMemSort` in `VIEW_KEYS`, §72).
**Verify.** test/teamcard.js (international @390, national @360, local @1280: page, cards and rows fit; one stacked row per team; default sort = event group; headings in order; "On Senior Women B" / "On Enbu Pair 2"; ticks kept through every sort; name A→Z; editor fits; choice remembered). dupview.js (updated selectors), worlds2026 (team size), full e2e set and the other browser tests.

## §74 Format label: "Kata score pools (12 max per pool)" (v1.47.1)
**Requirement.** The bracket format label for kata score pools reads "Kata score pools (12 max per pool)".
**Design.** `KT.FORMATS.KP` changed from "Kata score pools (8 per pool)". The label shows in the format picker (division settings, ring "Bracket format for this ring"), the Divisions table and the bracket header. Pool size behaviour is unchanged: the per-division "Kata pools: max per pool" setting (4–12, default 8; WTKF allows up to 12), and a pool of 9–12 is one first round (§64).
**Verify.** Unit 137; e2e set, v15, public, demos, cloud, fb, divorder, entsort, worlds2026, wtkfcharts, v117, bracketback, prevkata, ringcall, golive, mobile.

## §75 Competitors list sort; greyed-out bracket settings the format does not use (v1.48.0)
**Requirement.** Competitors card: sort by country / region / dojo-club, and by name ascending / descending. Division bracket settings: when a format is selected, grey out the settings of the other formats, because they do not apply.
**Design.**
- **Competitors tab:** a sort select beside the filter: Name A→Z (default), Name Z→A, By club / dojo, By region, By country (`KT.sortEntrants`). Group modes add a heading row per group with its count ("No region" etc. last). It works together with search and the filter. The choice is the person's own view (`compSort` in `VIEW_KEYS`, §72).
- **Division settings:** each format-specific setting carries `data-fmts`. `fmtApplies()` runs when the form opens and when Format changes; settings the format does not use are dimmed, disabled and labelled "Not used by <format>". Their values are kept and still saved (`fd` reads disabled fields), so switching back restores them.
  - Draw chart: SE, KP.
  - Third place: SE, RR, DE, DES (pool playoffs).
  - Double elim. number of pools: DE, DES.
  - Round robin pool size and advance per pool: RR.
  - Kata decision (flags / scores): head-to-head formats (kata score pools always use scores).
  - Kata pools max per pool: KP.
**Verify.** test/fmtsort.js (national demo, desktop and 390 px: A→Z default, Z→A, region / club / country headings in order with counts adding up, sort + filter, no horizontal scroll; SE / RR / DE grey out exactly the others' settings with the reason; a greyed value is kept and saved; kata score pools greys out the head-to-head settings; form fits). Full e2e set and the other browser tests.

## §76 Judges sort by country; App admin card collapsed by default; Competitors groups fold (v1.49.0)
**Requirement.** Judges card: sort by country. App owner: the App admin section is collapsed by default. Competitors card: the country listing is collapsible.
**Design.**
- **Judges tab:** "Sort judges" select: By name (default) / By country / By region / By dojo / club. In every card (Unassigned and each ring) the judges are A→Z, or grouped under a heading per country / region / dojo ("No country" etc. last). The choice is the person's own view (`judgeSort` in `VIEW_KEYS`, §72).
- **App admin card** (home, app owner / admins): `<details>` is no longer `open` by default. Opening or closing it is remembered on the device (`data-keep="admin"`, captured `toggle` event → localStorage `kt-open`), so a redraw never opens or closes it. The summary still shows the "N requests" chip while closed.
- **Competitors tab:** with the list grouped (country, region or club, §75), each group heading is a button (▾ / ▸, `aria-expanded`, Enter / Space). Tapping it hides or shows that group's competitors. "Collapse all" / "Expand all" sit above the list. Folds are kept per grouping (`compClosed[mode][group]` in the person's view): changing the grouping and back restores them, and they survive a reload.
- Tests that use the App admin card open it first (access, appaccess, appinvite, emails, emailsignin, adminphone). access.js checks it starts collapsed and stays open after a reload once opened. fmtsort.js ignores the fold arrow in headings.
**Verify.** test/judgefold.js (international demo, desktop and 390 px: judges grouped by country in order in each card, A→Z by name; country headings fold one / all / reopen one; another grouping has its own folds; same folds after switching back and after reload; Expand all; keyboard Enter; no horizontal scroll; judge sort remembered). access.js, full e2e set and the other browser tests.

## §77 Spectators don't load the database: compact copy, website cache, pause switch; follow a division (v1.50.0)
**Requirement.** Large crowds of spectators must not use up the Firestore quota or slow the database down for the people running the event (directors, ring managers, staff). Firestore cannot give signed-in users priority, so the app itself keeps spectator load small: (#2) spectators read a compact summary instead of every document, (#3) a website cache answers spectators so database use does not grow with the crowd, (#4) the director can cut spectators off at once. Spectators can also follow (☆) a division.
**Why.** Before this version every spectator page listened to 10 collections. Opening the page read every competitor, team, judge, division, ring, session and bracket (about 400 documents for 300 competitors), and every change was sent to every open page. On the Spark plan (50,000 reads a day for the whole project) about 120 spectators used up the day's quota, and then reads failed for everyone, staff included.
**Design.**
- **Compact copy (#2)**, kept by the staff's own app (no server):
  - `pubsnap/{e}/parts/{col}~{n}` = `{ col, d: { id: doc } }` for competitors (8 parts), teams (2), divisions (2), rings, sessions, judges (2), attendance (`PUB_COLS`). A document's part = FNV hash of its id mod the part count. Judges lose email, notes and phone. Private details stay in `pv/` and never reach the copy.
  - `pubsnap/{e}` = `{ v: { "p~<part>": version, "b~<division>": version } }`: one version per part and per bracket.
  - Brackets (`live/{e}/brackets`) and ring boards (`live/{e}/ringstate`) are not copied. Spectators read them as they are, so a score is not written twice.
  - Writing: the store is wrapped (`pubInstall`). After each write by this person to a copied collection or a bracket of the open event, the document is marked. 0.7 s later (when the local copy has the merged result) `pubFlush` writes the changed entries. `store.patch` uses Firestore `set` with `mergeFields` on `d.<id>` (null = `FieldValue.delete()`), so two people changing different entries of one part never overwrite each other. Then it bumps the versions in the manifest (random, unique for each write). This only happens while the event is shared (`public`) and not archived. Ring managers and staff publish only what they may write (brackets, attendance); directors publish everything.
  - Full sync (`pubSync`, director): compares every part with the event and writes the differences, adds missing versions and removes deleted brackets. It runs when a director opens a shared event, on Create public link and Go live (both give every part and bracket a new version, because changes made while unshared were not published), and from **Refresh spectators' data**.
  - Delete event also deletes the copy.
- **Who reads what** (`spectatorFeed`): the event's team (directors, ring managers, staff), local mode and claude.ai keep reading the event's own collections as before. Public-link visitors and signed-in people who are not on the team read the copy.
- **Website cache (#3)**, `api/live.js` (Vercel function, Firestore REST API without signing in, so the security rules apply exactly as for a visitor):
  - `GET /api/live?t=<token>` → event, versions, ring boards, logo. The CDN keeps it for 10 s (`s-maxage=10, stale-while-revalidate=20`, `max-age=0` in the browser). It costs 3 reads per cache period (event, manifest, ring boards); the share token and logo are kept in a warm instance.
  - `GET /api/live?t=<token>&k=<key>&v=<version>` → one part or bracket, cached for good (`immutable`). A new version is a new address, so each version is read from the database once per cache region.
  - Only `p~` (part) and `b~` (bracket) keys are served. Other paths are refused and the characters are cleaned.
  - Config: `FIREBASE_PROJECT_ID` / `FIREBASE_API_KEY` environment variables, otherwise `vercel/firebase-config.js` (`vercel.json` → `functions.includeFiles`).
- **Public page.** On http(s) it first asks `/api/live`; when the site has no function (file, local test) it falls back to the database.
  - Website cache (default, event `pubFeed: 'cdn'`): one request every 10 s (60 s while the tab is hidden). Only changed parts and brackets are fetched. The page makes no Firestore reads.
  - Direct (`pubFeed: 'direct'`, "instant (small events)"): listeners on the parts, brackets and ring boards. The director can switch at any time and open pages follow (cache → direct as soon as the bundle shows it; direct → cache through the event document).
- **Pause spectators (#4).** Live card → Spectators: **Pause spectators** / **Resume spectators** (`pubPaused`).
  - Rules: `isPublic(e)` = public && live && not paused, so paused spectators can read nothing but the event document.
  - The public page and signed-in spectators show "Live results are paused for a moment" and come back by themselves on Resume. Signed-in spectators' listeners are stopped and restarted (`feedPauseCheck`).
  - The team is not affected. Go live clears the pause.
- **Rules** (`firestore.rules` v1.50.0 — **redeploy the rules**):
  - event subcollections, `live/{e}/ringready` and `live/{e}/attendance`: event team only (no longer public);
  - `live/{e}/brackets`, `live/{e}/ringstate`, `pubsnap/{e}` and its parts: team, or public while live and not paused;
  - writes: manifest by the team; parts by directors; `attendance~n` parts also by staff / ring managers.
- **Follow a division**: Follow search lists divisions (☆). There is also a ☆ on every row of the spectators' Divisions list (it follows without opening the bracket).
  - A followed division's card shows its entrants, rings and status chip. While running: "On the mat now" per ring and the next three matches or performances (tap → match view / bracket). When finished: 1st / 2nd / 3rd. **Bracket ›** opens the bracket.
  - Follows are kept on the device (`divs` in `kt-follow-<event>`).
- **Cost** for the local demo (32 competitors, 11 brackets): spectator first load 29 reads (the event has 125 documents). With 300 competitors and 60 divisions, about 80 reads instead of about 400. In cache mode a spectator makes no reads at all: about 3 reads per 10 s for everyone together (≈11,000 over a 10-hour day), plus one read per changed part or bracket.
- **Limits.**
  - A part holds at most 1 MiB. A competitor is about 300 bytes and a division about 350 bytes (world demo), so 8 competitor parts hold about 25,000 competitors and 2 division parts about 6,000 divisions.
  - An older app version still open on a staff device does not publish its changes. Direct-mode spectators still see brackets and ring boards, but website-cache spectators only see the change after the next change from an up-to-date app, a director opening the event, or Refresh.
  - A visitor that opens inside the 10 s cache period after the director switches the feed may start on the old feed and switches over by itself.
**Verify.** test/livefn.js (in `npm test`, 28 checks):
- live / wait / paused / off / unknown states, value decoding, versions, ring boards, logo;
- cache headers; reads per bundle (5 cold, 3 warm); a part / bracket at a version (1 read, immutable);
- other keys and path tricks refused; paused → 403 for parts; old token after a new link; database down → 502; environment variables override the config file.

test/spectfeed.js (added to `npm run test:e2e`):
- Part A (Firebase mock, direct):
  - Go live writes every competitor into the copy, manifest complete; judges without email; no private data;
  - spectator 29 reads vs 125 documents, same dashboard as the director;
  - rules deny the event's collections, ring readiness and attendance, allow the copy, brackets and ring boards;
  - a check-in and a scored match reach the spectator;
  - follow a division (search, card, kept after reload, Bracket ›, ☆ on the Divisions list, phone width);
  - signed-in non-team spectator uses the copy;
  - Pause → paused page for both kinds of spectator, rules closed, director keeps reading and scoring; Resume → latest results;
  - Direct saved; Refresh rebuilds a deleted part.
- Part B (http site, real function over a stand-in REST API, emulated CDN):
  - 4 spectators, no Firestore reads of their own; 24 requests → 4 function calls → 12 database reads in 6 s;
  - a result and a check-in reach all of them; pause / resume;
  - Direct → pages move to listeners; Website cache → back to polling; a new visitor reads nothing;
  - site without the function → falls back to the database.

test/rules-emulator.js (`npm run test:rules`; needs Java and firebase-tools; 61 checks in the real Firestore emulator — the first run of `firestore.rules` in the emulator, see §6):
- signed out and signed-in non-team: event document, copy, brackets and ring boards allowed; competitors, judges, private details, ring readiness and attendance denied; no writes;
- team: director reads and patches parts and manifest; ring manager patches the manifest and the attendance part, not the competitors part; staff only the attendance part;
- field-level writes (`set` + `mergeFields` + `FieldValue.delete`): other entries kept, entry replaced whole, two writers on one manifest both kept, null deletes, works on a new document;
- paused: event document only, nothing else for spectators, team unaffected; resumed; before Go live; sharing off; archived (no writes);
- `api/live.js` against the emulator's REST API (`FIRESTORE_EMULATOR_HOST`): bundle, real value decoding, part, paused → 403.

Full browser regression: all 55 browser test files pass (access.js and publink.js needed a re-run: their sign-in steps are timing-sensitive under load, the same as before this change); unit 137 + 28.

## §78 Judges country groups fold; a ready ring's checklist folds to three lines (v1.51.0)
**Requirement.** Judges card: collapsible country. Mat card: after the ring is ready, collapse the checklist and display only the top 3 lines.
**Design.**
- **Judges tab:** when sorted by country, region or dojo (§76), each group heading in a card (Unassigned or a ring) is a button (▾ / ▸ "Country · n", `aria-expanded`). Tapping it hides or shows that group's judges in that card. "Collapse all" / "Expand all" sit above the cards. Folds are kept per sort mode and card (`judgeClosed[mode]["card|group"]` in the person's view, §72) and survive a reload.
- **Ring readiness box** (Mat tab, before going live): when the ring is Ready, the box shows three lines only:
  1. "<Ring> · Before the start" with the Ready chip.
  2. Judges n/need · Manager · Checklist 7/7 ✓ · Helpers.
  3. "▸ Show checklist" and "Mark not ready".
  - "Show checklist" opens the full box (with "▾ Hide checklist"); that is this person's view (`readyOpen`). Tapping "Ring is ready" folds it again. Unticking an item still makes the ring Not ready, which shows the full checklist.
- matready.js checks the folded three lines and re-opens the checklist before unticking.
**Verify.** test/judgefold.js (judge country headings fold one / all / reopen one, remembered after reload, Expand all; competitor folds as before). matready.js (folded 3 lines, Show checklist, untick → Not ready), golive, full e2e set and the other browser tests.

## §79 Competitors tab: where from by event level; events show the division assigned (v1.52.0)
**Requirement.** Competitors tab: display based on country / dojo / club. Events: show the actual division assigned (if assigned).
**Design.**
- `compWhere(c, level)`: the line under each name leads (in bold) with what the event separates by (International → country, National → region, otherwise dojo / club), then the other details. At International events the dojo is left out when it is just "Team <country>".
- Events column: each individual event shows the division the competitor is placed in (`DC.assign.byDiv`), e.g. "Black Belt Senior Men Individual Kata". A team event shows "<team> · <team's division>". Missing ones say what is missing: "Kata · no division", "Team Kata · no team yet", "<team> · no division". This replaces the short chips with "?" and tooltips. On a phone the events cell spans the full card width so long division names wrap cleanly.
**Verify.** test/compdiv.js (international @390, national @1280, local @360: the line leads with country / region / dojo; individual and team events show the assigned division; "no team yet"; fits the width). Full e2e set and the other browser tests.

## §80 Competitors list opens grouped by country (collapsible) (v1.53.0)
**Requirement.** Make the country (listing on the Competitors tab) collapsible — it should be there without first choosing a sort.
**Design.** `compSortMode()`: the person's own choice (§75) if they made one, otherwise the event level's group: International → By country, National → By region, otherwise By club / dojo. So the list opens with collapsible group headings (§76: tap a heading, Collapse all / Expand all). Name A→Z / Z→A stay available in the sort select. The fold actions use the same effective mode.
**Verify.** judgefold.js (international: opens By country with collapsible headings), fmtsort.js (national: opens By region with collapsible headings; A→Z / Z→A on choice), full e2e set and the other browser tests.

## §81 Competitor card shows the team and division assigned; export has the assignment per event (v1.54.0)
**Requirement.** Competitors tab: when a competitor is opened, show the actual team event (team) they are assigned to. Export competitors: include the actual event (division) they are assigned to instead of just Kata, Kumite, Team.
**Design.**
- `compAssigned(c, et)` (app1_core) → `{ div, team, text }` from `DC.assign.byDiv`: the division (individual events), or the team and its division (team events). It also covers what is missing: "Kata · no division", "Team Kata · no team yet", "<team> · no division". The Competitors list (§79), the card and the export all use it.
- **Competitor card:** each entered team event shows a button "<team> · <division> ›" that opens the team, or "Not on a team yet" (assign on the Teams tab). Each entered individual event shows "In: <division>" under its division picker (or "No division yet").
- **Export CSV:** the `events` column keeps the event names, so an exported file still imports. One column per offered event is added (header = event name) holding the assignment text. Import ignores those columns unless they hold yes / x / 1, so they don't add or remove events.
- Test fix: signin.js waits for the sign-in call instead of a fixed 400 ms (it failed under load twice).
**Verify.** test/compcard.js (national @390: card shows "Senior Women A · Black Belt Senior Women Team Kata" matching the list; "In: …" for individual events; the team button opens the team; "Not on a team yet"; fits the phone; export: events column kept, columns per event with the division names and "team · division"). compdiv.js, yob.js (export), full e2e set and the other browser tests.

## §82 Competitor export: fixed column order; women then men, youngest first (v1.55.0)
**Requirement.** Export columns: First, Last, gender, birth_year, age, rank, dojo, state, country, Individual Kata, Individual Kumite, Team Kata, Team Kumite, Fukugo, Enbu, waiver, paid, checked_in, status, email, phone, emergency_name, emergency_phone. Sort: female then male, youngest to oldest.
**Design.**
- `export-comps` writes exactly those columns. The six event columns are always present and hold the assignment text (`compAssigned`, §81) for events the competitor entered, blank otherwise. The separate `events` column is gone.
- The birth column is `birth_year` at International events (year only, §62). Other levels keep the full date under `dob` in the same position, because their ages count on the event's age-as-of date.
- Sort: gender F, then M, then anything else. Within each, age ascending (unknown last), then last and first name.
- Private columns (birth date, email, phone, emergency contact) stay empty for non-directors.
- **Import** keeps exported files importable: an event column counts as entered when it holds anything but blank / no / n / false / 0 / -. So "X" and our own division or team text both count.
**Verify.** compcard.js (exact header order; women then men, youngest first; division and "team · division" values; re-import of the exported file gives everyone the same events — compared as a whole because demo names repeat). yob.js (International: birth_year). Import tests (lenient, federation, Worlds 2026, judges), full e2e set and the other browser tests.

## §83 Division printout per country / region / club, Letter or A4 (v1.56.0)
**Requirement.** Division card: print, per country / dojo / club, all divisions with competitors, formatted for Letter or A4 paper, like the director's "Division printout" example (Numbers sheet).
**Design.**
- Example sheet: title "<group> Competitors"; per age group (Senior, Youth…) yellow-headed boxes in pairs Individual Kata | Individual Kumite, Team Kata | Team Kumite, Fukugo | Enbu; each box has Women and Men columns of names; Enbu has a "Mixed Gender" part.
- `KT.printGroups(divs, placed, groupOf)` (pure, unit-tested) → groups A→Z ("No …" last) → age groups (black belt Senior → Youth → Junior → Cadet, then "Kyu <group>") → rows of paired blocks (a row is left out when neither side has entrants) → block {F, M, X ids}. `groupOf` may return several groups, so a team with members from different countries is printed on each of their pages.
- `app12_print.js`: Divisions tab "🖨 Print by country" (region / club by event level) opens a dialog:
  - One page per Country / Region / Club (default by event level); All or one group; Paper Letter or A4 (remembered on the device).
  - A live preview of the pages.
  - Print builds `#print-root` from the same HTML, sets `@page { size: letter | A4; margin: 12mm }`, and calls the browser's print (which also saves to PDF). Under `@media print` only the pages show, one group per page (`break-after: page`), boxes are not split across pages, and the yellow prints (`print-color-adjust: exact`). Afterwards the app returns.
- Names: competitors "Last, First" (with the rank mark of §71 where seeded); team events show the team name in bold then its members. The page subtitle gives the event, date and number of competitors.
**Verify.** logic.test (printGroups: per-country pages, age order, pairs, empty divisions left out, mixed team on both pages). test/divprint.js (international demo: 10 country pages A→Z; Japan page titles in order; yellow titles; Women | Men; Kata beside Kumite; teams with members; one country; per club; Letter and A4 PDFs with 612×792 / 595×842 pt pages; the app returns after printing; phone fit). Full e2e set and the other browser tests.
