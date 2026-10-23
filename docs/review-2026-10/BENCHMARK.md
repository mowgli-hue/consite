# Consite — Competitive Benchmark (final, 2026-10-22, America/Vancouver)

> **Changelog 2026-10-22 18:20 America/Vancouver:**
> - Sections 2 and 5 rebuilt from Atlas **deep/** (NOTES.md + 39 screenshots) and **crew/** (crew-morning simulation NOTES.md + 5 screenshots).
> - Earlier rounds (round 1, round2, round3, round4) are used only where noted.
> - Competitor and regulatory facts come from `research-competitors.md`.

**Evidence and labels**
- **[V]** = seen in a deep/ or crew/ capture.
- **[V-old]** = seen only in earlier rounds and not re-seen in deep/ or crew/.
- **[U]** = unverified.

Capture conditions:
- Desktop 1920px; mobile 390px Chrome DevTools, i.e. **responsive web, not a native app**.
- Signed in only as ADMIN ("Nav Rai"). **No worker or foreman account was tested**, so worker-only screens may exist [U].
- The crew run **created one test photo (`test.jpg`) in production project sample-project-1**. Remove it if unwanted. I did not touch it.

## 1. Executive summary
Consite is a BC-focused office web app.
- **Stage-gated project lifecycle:** Contract → Setup → Crew → Build → Punch List → Closeout.
- **WorkSafeBC checks built in:** a first-aid-attendant gate, foreman gate, FLHA coverage rate, toolbox-talk count and cert expiry.
- **Crew Board:** worker × site matrix with "No foreman" / "No first aid" badges.
- **FLHA submissions render onto the familiar MHSA PDF.**

No benchmarked competitor ships WorkSafeBC gating out of the box. That is the differentiator.

The crew-morning simulation shows **the field day mostly can't be done in the app**:
- No clock in or out.
- No FLHA fill entry point on the project.
- No create UI for daily logs or punch lists.
- **Only photo upload works:** 2 taps, about 10 s, but no caption, GPS or readable uploader.

Plus severe slowness (15–20 s loads, Firestore listener errors), non-semantic navigation, no persistent mobile nav, and crew data that disagrees between screens.

**Priority:** fix performance and data integrity, then build the crew-morning loop on mobile (clock in → FLHA → photos → daily log → punch → clock out).

## 2. Consite feature inventory (verified from deep/ and crew/)
| Area | What exists [V] | UX strengths | Weaknesses / bugs [V] | Evidence |
|---|---|---|---|---|
| Dashboard | Tiles: On site now, Unread alerts, Active sites. "Jobs at a glance" cards with stage bar and next blocker. Today/Manage grids. Disabled "Form Builder — Coming soon" tile | Each job shows its single next action | ~15 s cold load ("Checking every job…"). Focus ring sticks. Faded "Coming soon" card. Ambiguous "Nav" logout plus a second unlabeled logout icon. **No clock-in for the field** | deep 01, 02, 30–32; crew 03 |
| Project page (Fleetwood) | Tabs: Lifecycle, Photos, Documents, Forms, Punch List, Daily Logs, Crew | Familiar tabs | Tab bar overflows at 390px with no cue. Project not highlighted in sidebar | deep 23–29, 36; crew 01 |
| Lifecycle | 6-step stepper. Crew-step checks: Foreman assigned, Crew assigned (3), **First-aid attendant (WorkSafeBC, OFA ticket)**. Trade templates (+ House framing, + Drywall). Disabled "Clear the checklist to advance" | Compliance as a gate; plain-language guidance | Guidance sends you elsewhere ("Users → expand → tap role chip") instead of fixing inline. Disabled button has very low contrast | deep 23, 36; crew 01 |
| Photos | **Add photo → file picker → upload works (2 taps, ~10 s)**. Card shows filename, a **raw user ID string** and timestamp | Fast; instant save | **No caption, no tags, no GPS seen, no in-app camera seen**; uploader shown as an ID, not a name | crew 05 |
| Forms (project tab) | List of 5 past FLHA submissions with open-PDF link | PDF output matches the MHSA FLHA paper form | Shows raw IDs (`flha-daily-v1`), not titles. **No "fill new FLHA" entry point found** (admin session) | deep 26, 37; crew 04; PDF in round4/04 [V-old] |
| Daily Logs | Empty state: "the foreman writes one per day (AI drafts it)" | — | **No create UI for admin**; foreman flow [U] | deep 28; crew notes |
| Punch List | Empty state: "Clean punch list — nothing reported." | — | **No create UI**; reads as "all good" when there's simply no data | deep 27; crew notes |
| Documents | Tab exists | — | Upload drawing button not opened; plan viewing/markup [U] | deep 25 |
| Crew tab | 3 members with phone/email and a call icon | One-tap call | Phone/email are plain text; counts conflict with Crew Board | deep 29, 38 |
| Crew Board | Matrix of 3 workers × 4 sites. Tiles: 3 active, 1 on bench, **4 sites w/o first aid**. Foreman/first-aid badges. Legend; tap a cell to assign | Strong staffing + compliance view | ~20 s to load. Headers say "3/4 crew" but the matrix shows 1 per site. Two "Navdeep Singh Sandhu" rows, no email to tell them apart. Mobile matrix shows 1 site at a time | deep 10, 33 |
| Users | 8 accounts; add form; expanded row with role chips, Active switch, project checkboxes | Clear role badges | Duplicate name; role chips under 44 px | deep 11–13 |
| Clients | 1 client (Brown Bros); New client form; communication log | Simple CRM log | No client portal seen [U] | deep 14–16 |
| Projects | 4 projects with stage and worker count; New project with **geofence (default on, 150 m)**; Edit form | Geofence for sites | Edit form's geofence toggle is off with no coordinates; New/Edit mismatch; small pencil/chevron targets | deep 17–19 |
| Forms & Documents library | "Forms crews can fill (2 active)": Daily FLHA (5 sections/8 fields), Brown Bros FLHA (9 sections/45 fields). 4 company PDFs (harness, tools, scaffolding checklists, SignSheet). Upload PDF | Custom per-company FLHA | Rows can't be clicked to preview; no form builder yet | deep 20, 34 |
| Search | Project chips; natural-language box; "5 records indexed" (FLHA snippets) | Ask-your-project idea | 5–10 s spinner; raw IDs and truncated text in results | deep 03, 04 |
| Inbox / Site Timeline | Unread/All, "All caught up"; Timeline empty ("photo + voice updates from Work Update button") | — | Timeline didn't show the crew test photo. Real-time feed [U] | deep 05, 06 |
| Money | Ready to invoice, Longest waiting, Contracts in play; **Payroll export** link | Milestone invoice queue | Empty; export format [U] | deep 07 |
| Hours & Reports | Project and range chips (7/14/31 days); **Audit pack — all signed records**; totals by worker | Inspector-ready idea | Empty; unlabeled download icon; spinner | deep 08, 09 |
| Safety Center | Worst site FLHA, Open deficiencies, Certs expired ≤30d; per-site 14-day worker-days with FLHA and toolbox talks | FLHA coverage rate is unique | All "–"/0 because the window excludes July data; "All certs" just opens Compliance | deep 21, 35 |
| Compliance | Expired/Expiring/Valid; "All clear"; "Coming in v0.3": 30/14/7-day reminders, 90-day audit-pack PDF | Traffic-light status | **Shows "All clear" with 0 valid certs while every site lacks first aid**; different header style | deep 22 |
| Platform | Railway-hosted web app; Firestore realtime; files in Firebase Storage [V-old round4/04] | — | Firestore `Listen/channel` 400 / connection-closed errors; late 400 KB icon font; aria-hidden focus warnings; **storage region unknown** | deep NOTES #1–4, 39 |

### Bugs (severity from Atlas deep NOTES; crew findings added)
1. **High** — slow loads (cold ~15 s, Crew Board ~20 s, 5–10 s spinners) and Firestore listener errors.
2. **High** — sidebar, tabs, rows and back arrow are divs: no links, no roles, no new-tab.
3. **High (crew)** — no clock in/out, no FLHA fill, no daily-log or punch-list create in the admin session. These are core field flows.
4. **Med** — no persistent nav at 390px; tab bar and Crew Board overflow.
5. **Med** — Crew Board counts disagree with project cards and Crew tab; two users share a name.
6. **Med** — misleading zero states (Compliance "All clear", Safety zeros, "Clean punch list").
7. **Med** — raw form IDs in Forms tab and Search; photo uploader shown as a raw ID (crew 05).
8. **Med** — contrast ~1.5–2:1, 10–11 px text, tap targets under 44 px; sticky focus ring; aria-hidden warnings.
9. **Low** — inconsistent headers and back arrows; "Nav" logout label; geofence New/Edit mismatch; library rows inert; site-name casing and order; unlabeled icons; narrow columns on desktop.
10. **Dropped as stale:** round4 "Projects → Dashboard" (deep 17 shows /projects working) and "Hours → Reports" (by design, "Hours & Reports"). Round 1 "crew spinner stuck" was never shown in an image.

## 3. Feature matrix
Y / P (partial) / N / ? (unknown).
- Consite cells come only from deep/ and crew/.
- Competitor cells come from `research-competitors.md`. Offline, AI and portal cells are general product knowledge, **not individually re-verified**.

| Feature | Consite | Procore | Buildertrend | Fieldwire | CompanyCam | Raken | SafetyCulture |
|---|---|---|---|---|---|---|---|
| Mobile field app | P (responsive web only) | Y | Y | Y | Y | Y | Y |
| Offline | ? (untested) | Y | P? | Y | Y | Y | Y |
| Photo capture | P (upload works; no caption/GPS seen) | Y | Y | Y | **Y** | Y | Y |
| GPS/timestamp on photos | P (timestamp only) | Y | Y | Y | Y | Y | Y |
| Daily logs | N (no create UI seen) | Y | Y | P | P | **Y** | P |
| Punch lists | N (no create UI seen) | Y | Y | **Y** | P | P | P |
| Plans/markup | ? | Y | P | **Y** | N | N | N |
| Forms/inspections | P (2 FLHA templates, PDF output; no fill entry seen; builder "coming soon") | Y | P | Y | Y | Y | **Y** |
| WorkSafeBC gating (first aid, foreman) | **Y** | N | N | N | N | N | N |
| Cert expiry tracking | P (counts; reminders v0.3) | P | ? | N | N | ? | P |
| Time clock | N (not found) | Y | Y | N | N | **Y** | N |
| Payroll export | P (link only) | P | P | N | N | Y | N |
| Crew scheduling/board | **Y** | P | Y | N | N | P | N |
| Geofenced sites | P (setting on project) | ? | ? | ? | ? | ? | ? |
| Client CRM/portal | P (CRM log; no portal seen) | P | **Y** | N | P | N | N |
| Invoicing/milestones | P (empty) | Y | Y | P | P | N | N |
| AI search | P (UI; quality ?) | ? | ? | ? | P | ? | P |
| Audit pack | P (button; PDF in v0.3) | ? | N | N | N | ? | P |
| Canadian data residency | ? (Firebase region unknown) | ? | ? | ? | ? | ? | ? |

## 4. Best UX patterns to copy
- **CompanyCam:** in-app camera with automatic GPS and time stamps, captions/tags, project photo timeline, shareable galleries.
- **Raken:** guided daily report (auto weather, crew hours, notes, photos), time cards, toolbox-talk library.
- **Fieldwire:** offline plan sheets; pins become punch items or tasks.
- **SafetyCulture:** template builder, offline inspections, failed item → action.
- **Buildertrend:** client portal with approvals.
- **Procore:** free unlimited users for subs and owners.
- **Consite's own patterns to keep:** lifecycle gates, next-blocker job cards, compliance-badged crew board, MHSA-faithful PDF, geofenced sites.

## 5. Consite gaps (from deep/ and crew/)
1. **No crew-morning loop:**
   - clock in/out not found
   - FLHA fill not reachable from the project
   - no daily-log or punch-list create UI
   - (all in an admin session; a worker view is [U])
2. **Photos lack field metadata:** no caption, tags, GPS or in-app camera seen; uploader shown as an ID; photo not on Site Timeline.
3. **Mobile is responsive web** with no persistent nav; offline untested.
4. **Performance and realtime reliability** (Firestore errors).
5. **Data integrity:** crew counts, duplicate names, misleading "All clear".
6. **Accessibility:** semantics, contrast, tap targets.
7. **Not seen anywhere:**
   - incident / first-aid record / Form 7
   - 3.23 orientation
   - monthly crew-meeting minutes
   - retention policies
   - plans/markup
   - client portal
   - accounting/payroll integrations
   - stated data region
8. **Roadmap, not built:** form builder, cert reminders, audit-pack PDF.

## 6. Differentiators for small/mid BC contractors
- **Orientation (OHS Reg 3.23):** checklist with all 13 required topics (a–m) and signature, kept for employment + 1 yr. Gate crew assignment on it, like the existing first-aid gate.
- **First aid records (3.19):** confidential, ≥3 yrs. WorkSafeBC says electronic records "should be stored in Canada".
- **Form 7 within 3 days:** incident → countdown → pre-filled report → link to WorkSafeBC online. Don't claim direct submission [U].
- **Monthly crew safety meetings:** date, attendees and topics. Toolbox counts already exist on the Safety Center.
- **FLHA:** industry practice. Consite already measures FLHA coverage per worker-day and has per-company templates.
- **Retention:**
  - first aid: 3 yrs
  - orientation: employment + 1 yr
  - OHS program / inspection reports: indefinite
  - JHSC reports: 2 yrs
  - payroll: 4 yrs (ESA s.28)
- **Crews:** the crew board with first-aid/foreman coverage is already a standout, once its counts are fixed.
- **Canadian residency:** move Firestore and Storage to a Canadian region and publish that. PIPA doesn't require it, but WorkSafeBC first-aid guidance favours it.
- **Payroll records:** time clock (missing today) → daily hours by job → 4-yr retention → CSV for Canadian payroll. BC overtime rules are [U].

## 7. TOP 10 improvements
Value and effort are scored 1–5 (5 = most valuable / most effort).

| # | Improvement | Value | Effort | Rationale | Acceptance criterion | Best at |
|---|---|---|---|---|---|---|
| 1 | Fix load performance and Firestore listener errors | 5 | 3 | 15–20 s loads block every flow on site | Cold load under 3 s, Crew Board under 2 s on throttled 4G; zero Listen 400s in the console | Fieldwire |
| 2 | Mobile time clock (in/out per site, geofence-checked) | 5 | 3 | Not found in crew run; it drives "On site now", hours and payroll | Worker clocks in/out in ≤2 taps at 390px; entry appears in Hours & Reports with site and time | Raken |
| 3 | FLHA fill from the project + crew sign-off, offline, titles not IDs | 5 | 3 | Core WorkSafeBC habit; no fill entry found; feeds the Safety Center rate | Foreman starts the Daily FLHA from the project, finishes in under 2 min offline, crew sign, PDF appears in Forms with its title | SafetyCulture |
| 4 | Crew data integrity + honest empty states | 5 | 2 | Conflicting counts and a false "All clear" break compliance trust | Crew Board, cards and Crew tab show identical counts; duplicate names show email; "No certs on file" replaces "All clear" | Procore |
| 5 | Mobile nav + semantic links + a11y (bottom bar, `<a href>`, 44 px, ≥4.5:1) | 4 | 2 | Field use is mobile; currently 2–3 back-taps between sections | Any section reachable in ≤2 taps at 390px; axe check shows no role/contrast failures | CompanyCam |
| 6 | Photo metadata: in-app camera, caption/tags, GPS, uploader name, on Timeline | 4 | 2 | Upload works but has no evidentiary metadata | Photo shows name, caption, lat/long and time, and appears on Site Timeline within 5 s | CompanyCam |
| 7 | Daily log create flow (auto weather, crew hours, notes, photos, AI draft) | 4 | 3 | No create UI exists | Foreman creates one log per site per day; PDF and email to office | Raken |
| 8 | Incident → first aid record → Form 7 3-day tracker | 5 | 3 | Legal deadline; not in the app | Incident creates a confidential first aid record; alerts at 24/48 h; Form 7 fields pre-filled | (none; differentiator) |
| 9 | 3.23 orientation checklist as crew-assignment gate | 5 | 2 | Legal requirement; fits the existing gate pattern | All 13 topics plus signature required before assignment; retained employment + 1 yr | (none; differentiator) |
| 10 | Punch list create with photo pins | 3 | 3 | No create UI; needed for the Punch List lifecycle stage | Add item with photo, assignee and due date; closing it updates the Lifecycle step | Fieldwire |

Next tier:
- Canadian data region + retention engine (4/3).
- Audit pack PDF + cert reminders (4/2, SafetyCulture).
- Payroll CSV export tested against a Canadian payroll tool (4/2).
- Form builder (3/4).

## 8. Open questions
- Do worker/foreman accounts have clock, FLHA, daily-log and punch create screens that ADMIN doesn't see? This is the biggest open question.
- Is there offline support or a native app?
- Firestore and Storage region?
- Does the photo flow capture GPS/EXIF in storage even though the UI doesn't show it?
- What is the Payroll export format?
- Is AI Search accuracy and the Daily Log "AI drafts it" flow working?
- Should the crew test photo be deleted?
- Is there a client portal?
- Small-employer formal-program threshold, and BC overtime rules?

## 9. Sources
- Captures: `/workspace/consite-review/*.png`, `round2/`, `round3/`, `round4/`, `/workspace/jungle-labs/consite/qa-screens/`, `/workspace/consite-review/deep/` (NOTES.md + 01–39), `/workspace/consite-review/crew/` (NOTES.md + 01–05).
- Competitor and regulatory sources: see `/workspace/jungle-labs/consite/research-competitors.md`. Key URLs:
  - https://www.fieldwire.com/pricing/
  - https://help.companycam.com/en/articles/14477655-companycam-plans-explained
  - https://buildertrend.com/pricing/
  - https://www.capterra.com/p/56250/Procore/
  - https://apps.apple.com/ag/app/raken-construction-management/id747582049
  - https://getpulsesignal.com/pricing/safetyculture
  - https://www.bclaws.gov.bc.ca/civix/document/id/crbc/crbc/296_97_multi/
  - https://www.worksafebc.com/en/law-policy/occupational-health-safety/searchable-ohs-regulation/ohs-regulation/part-03-rights-and-responsibilities
  - https://www.worksafebc.com/en/health-safety/first-aid/record-first-aid-incidents
  - https://www.worksafebc.com/-/media/WorksafeBC/Resources/forms/all-forms/7-pdf-en.pdf
  - https://www2.gov.bc.ca/assets/gov/employment-business-and-economic-development/employers/employers-advisers-office/record_retention_guide_2025.pdf
  - https://www.oipc.bc.ca/blog/news/in-the-clouds-and-beyond-navigating-access-and-storage-outside-of-canada/
  - https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/forms-resources/igm/esa-part-3-section-28
