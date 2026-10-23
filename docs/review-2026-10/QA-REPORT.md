# Consite QA Report (AI QA review)

- **App:** Consite, https://consite-production.up.railway.app (construction sites, crew, safety/FLHA)
- **Reviewer:** quinn-ai-review (Quinn, QA & Release Manager, Jungle Labs). This is an AI QA review.
- **Date:** 2026-10-22
- **Basis:** Atlas's signed-in ADMIN captures in `/workspace/consite-review/` (rounds 1-4 plus the `deep/` pass: NOTES.md and 39 screenshots). **Quinn did not run the app.** Every finding comes from those screenshots and notes. Nothing was created, edited or submitted in the app, and no live data was touched for this report.
- Screenshot paths below are relative to `/workspace/consite-review/`.

---

## 1. Summary

**Verdict: not release-ready. Rated "Beta, needs fixes".** The core flows render and the visual design is clean. Four problems block release:
- Some data looks wrong: duplicate users, crew counts that don't match each other, and "All clear" or "–" shown when there is no data.
- Routing is unreliable: Projects and /forms send you to /dashboard.
- Loads are slow and the Firestore realtime channel is erroring.
- Accessibility basics are missing: the nav is built from divs, contrast is low and tap targets are small.

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 6 |
| Medium | 13 |
| Low | 17 |
| **Total** | **36** |

No issue was rated Critical, because nothing in the evidence shows data loss or a security breach. CS-1 and CS-4 are the closest.

**Top 5 fixes**
1. **CS-1** Fix the Firestore Listen channel errors (400 / ERR_CONNECTION_CLOSED) and the 5-20 s load times.
2. **CS-2** Fix routing: the Projects sidebar item, `/projects` and `/forms` should not redirect to `/dashboard`.
3. **CS-4** Stop safety and compliance tiles reading as "fine" when there is no data: Worst site FLHA shows "–", and Compliance shows "All clear" with 0 certs.
4. **CS-3** Merge or clearly tell apart the duplicate "Navdeep Singh Sandhu" accounts on the Crew Board and Users page.
5. **CS-5** Make navigation semantic (links/buttons with `href` and roles) and add persistent mobile nav (CS-7).

---

## 2. QA test plan

### 2.1 Scope
**In scope:**
- Every route seen in the captures: `/dashboard`, `/search`, `/inbox`, `/timeline`, `/money`, `/reports` (Hours), `/crew`, `/users`, `/clients`, `/projects`, `/library` (Forms & Documents), `/safety`, `/compliance`
- `/project?id=…` and its tabs: Lifecycle, Photos, Documents, Forms, Punch List, Daily Logs, Crew
- Sign-in/out, plus FLHA form viewing and PDF rendering

**Out of scope for a read-only pass:**
- Any create, edit or delete action: upload, add client, save project, crew assignment cells, role chips, archive
- Native pickers

### 2.2 Environments
| Env | Viewport | Status in evidence |
|---|---|---|
| Desktop Chrome | 1920×1113 (screenshots downscaled to about 1024 px) | Captured |
| Mobile | 390 px (DevTools device mode) | Captured (30-38) |
| Mobile | 375 px | **Not captured** |
| Tablet | 768 px | **Not captured** |
| Real iOS Safari / Android Chrome | n/a | **Not captured** |
| Roles | ADMIN only | Manager and Worker **not captured** |

### 2.3 Test areas
1. **Auth/roles:** sign-in, sign-out (the "Nav" footer item and the dashboard exit icon), signed-out redirect from deep routes, and role-gated pages for Manager and Worker.
2. **Navigation/routing:** sidebar items, dashboard cards, back arrows, deep links and reload, the sidebar active state, open-in-new-tab.
3. **Modules:** each page listed in scope, plus the project tabs.
4. **Data integrity/duplicates:** user identity, crew counts across Crew Board, Projects and the project Crew tab, and stat tiles against the underlying data.
5. **Forms validation:** New account, New client, New project and Edit project. Check required fields, formats (email, phone, Maps link, geofence radius) and error messages.
6. **Empty/error states:** every empty tab and list, offline and failed loads, the "Coming soon" tiles.
7. **Responsiveness:** 375, 390, 768 and desktop widths. Check nav, tables and matrix, tab overflow.
8. **Accessibility (WCAG 2.2 AA):**
   - contrast (1.4.3, 1.4.11)
   - focus visible and not obscured (2.4.7, 2.4.11)
   - keyboard (2.1.1)
   - target size (2.5.8, 24 px minimum; 44 px recommended for field use)
   - name/role/value (4.1.2)
   - labels (3.3.2)
9. **Console errors:** JS errors, failed network requests, aria warnings.
10. **Performance:** cold load, in-app navigation, LCP/INP, font loading.
11. **Security/privacy basics:**
    - auth redirect on protected routes
    - role access to admin pages
    - PII exposure (emails and phone numbers on Users and Crew)
    - Firestore rules

### 2.4 Test cases
Status values: Pass, Fail or Not run, based only on the captured evidence.

| ID | Area | Steps | Expected | Status |
|---|---|---|---|---|
| TC-01 | Auth | Open the app signed in as ADMIN | Dashboard shows user and role | Pass (round4/07: "Nav Rai · ADMIN — full access") |
| TC-02 | Auth | Sign out, then open `/users` directly | Redirect to sign-in | Not run |
| TC-03 | Roles | Sign in as Worker or Manager and open `/users`, `/money` | Access denied or hidden | Not run |
| TC-04 | Routing | Click Projects in the sidebar | `/projects` loads | Fail (round4/07 lands on /dashboard). deep/17 shows /projects rendering, so the bug is intermittent or path-dependent |
| TC-05 | Routing | Enter `/projects` and `/forms` in the URL bar | Page loads | Fail (round4/09) |
| TC-06 | Routing | Sidebar Hours & Reports | `/reports` Hours page | Pass (round4/08) |
| TC-07 | Routing | Open `/project?id=sample-project-1` | Project loads and a sidebar item is active | Partial: loads, but nothing is highlighted (deep/23) |
| TC-08 | Routing | Middle-click or open a sidebar item in a new tab | New tab opens the route | Fail (no `href`s per NOTES #5) |
| TC-09 | Dashboard | Load the dashboard cold | Tiles populated in under 3 s | Fail (about 15 s, deep/01) |
| TC-10 | Search | Open /search and view results | Readable titles | Fail (raw form IDs, deep/04) |
| TC-11 | Inbox | Open /inbox | Clear empty state | Pass (deep/05) |
| TC-12 | Timeline | Open /timeline | Empty state | Pass (deep/06) |
| TC-13 | Money | Open /money | Tiles and Payroll export | Pass with polish issues (deep/07) |
| TC-14 | Hours | Pick a range chip | Totals or empty message | Partial: empty "ALL ENTRIES" heading (deep/09) |
| TC-15 | Crew Board | Compare header counts with matrix ticks | Counts match | Fail (deep/10) |
| TC-16 | Users | List accounts | One record per person | Fail (duplicate Navdeep, deep/11) |
| TC-17 | Users | Open the New account form | Labelled fields | Partial: form opens but placeholder contrast is low (deep/12). Validation not run |
| TC-18 | Clients | Open New client and expand a row | Form and communication log | Pass (deep/15, 16). Validation not run |
| TC-19 | Projects | Compare the New and Edit project forms | Same fields | Fail (geofence differs, deep/18 vs 19) |
| TC-20 | Library | Click a fillable form row | Preview | Fail (no action, deep/20) |
| TC-21 | Safety | Open Safety Center | Meaningful tiles | Fail ("–" Worst site FLHA, deep/21) |
| TC-22 | Compliance | Open with no cert data | "No data" state | Fail ("All clear", deep/22) |
| TC-23 | Project tabs | Open each tab | Content or empty state, no stuck spinner | Pass in the deep round (23-29). Round 2 showed a Crew spinner (round2/08) |
| TC-24 | Project Forms | Open the Forms tab | Form titles | Fail (raw IDs, deep/26) |
| TC-25 | Forms PDF | Open a submitted FLHA | PDF renders | Pass per round3/16 and round4/04 (opened). Content fidelity not verified |
| TC-26 | Forms validation | Submit forms with empty or invalid fields | Inline errors | Not run (read-only) |
| TC-27 | Mobile 390 | Navigate between sections | Persistent nav | Fail (deep/30-32, 36) |
| TC-28 | Mobile 390 | Project tab bar | All tabs visible or a scroll cue | Fail (deep/36) |
| TC-29 | Mobile 390 | Crew Board | Usable matrix | Fail (deep/33) |
| TC-30 | 375 / 768 | All key pages | Layout holds | Not run |
| TC-31 | A11y | Tab through the sidebar and tabs | Visible focus on each | Fail or partial (NOTES #6, deep/02) |
| TC-32 | A11y | Contrast of captions and placeholders | 4.5:1 or better | Fail (visual estimate about 1.5-2:1, NOTES #23; not measured) |
| TC-33 | A11y | Screen reader roles | Links and buttons announced | Fail (generic divs, NOTES #5) |
| TC-34 | Console | Open any page with DevTools | No errors | Fail (Firestore 400, aria-hidden, deep/39) |
| TC-35 | Perf | Lighthouse or Web Vitals | LCP under 2.5 s | Not run |
| TC-36 | Privacy | Check which roles can see staff emails and phones | Admin and manager only | Not run (shown to ADMIN, deep/11, 29) |

---

## 3. Bugs (deduplicated across rounds 1-4 and the deep pass)

**Format.** Each bug lists:
- Steps (S)
- Expected (E) and actual (A)
- Screenshot (Shot)
- Suggested fix (Fix)

All steps assume you are signed in as ADMIN.

### High

**CS-1: Slow loads and Firestore realtime channel errors**
- Page: all pages; worst on `/`, `/crew`, `/search`, `/reports`, `/timeline`, `/safety`
- S: Cold-load `/`, or move between sections in the app.
- E: Content within a few seconds, and a clean console.
- A:
  - About 15 s spinner on `/`; about 20 s on the Crew Board; 5-10 s on other pages.
  - Blank grey page when reloading a deep route.
  - Repeated `Failed to load resource` on `firestore.googleapis.com/.../Listen/channel` (400 and `net::ERR_CONNECTION_CLOSED`).
- Timings come from Atlas's observations and were not measured.
- Shot: deep/01, deep/03, deep/08, round2/08 (Crew tab spinner)
- Fix:
  - Check the Firestore listener setup: project and database ID, auth token timing, too many concurrent listeners.
  - Try `experimentalAutoDetectLongPolling`.
  - Show cached or skeleton data, and add an error state when a listener fails.

**CS-2: Projects in the sidebar, `/projects` and `/forms` redirect to `/dashboard`**
- Page: sidebar → Projects; `/projects`; `/forms`
- S: Click Projects in the sidebar, or type `/projects` or `/forms` in the URL bar.
- E: The Projects page (or Forms & Documents) loads.
- A: Lands on `/dashboard` with Dashboard highlighted. deep/17 shows `/projects` rendering at least once, so this looks intermittent or depends on the route taken. The real forms route appears to be `/library`.
- Shot: round4/07, round4/09 (vs deep/17)
- Fix:
  - Register the `/projects` route.
  - Alias or redirect `/forms` to `/library`.
  - Make the catch-all show a 404 rather than the dashboard.
  - Add routing smoke tests.

**CS-3: Duplicate "Navdeep Singh Sandhu" accounts**
- Page: `/crew`, `/users`
- S: Open the Crew Board, then Users.
- E: One identity, or clearly different labels.
- A: Two rows with the same name:
  - lavishadhingra06@gmail.com, 1 project, on the board
  - admin@junglelabsworld.com, 0 projects, "on the bench"
- The Crew Board shows no email, so you can't tell which row is which.
- Shot: deep/10, deep/11, round4/05, round4/06
- Fix:
  - Merge or rename the admin account.
  - Show the email or a secondary identifier on the Crew Board.
  - Warn about duplicate display names when an account is created.

**CS-4: Safety and compliance tiles look "fine" when there is no data**
- Page: `/safety`, `/compliance`
- S: Open Safety Center, then Compliance.
- E: The tiles say there is no data in the window, or show the real value.
- A:
  - "Worst site FLHA" shows "–". Open deficiencies show 0 and "Certs expired" shows 0.
  - Every site shows "0/0 worker-days" and "no work", because the 14-day window excludes the July FLHAs.
  - Compliance shows a green "All clear" with 0 certs, even though the Crew Board reports 4 sites without first aid.
- Shot: deep/21, deep/22, deep/10, deep/23, round4/11
- Fix:
  - Show an explicit "No FLHA data in last 14 days" message, and let the user widen the window.
  - Show "No certs on file" instead of "All clear" when the count is 0.
  - Cross-check against the first-aid flags.

**CS-5: Sidebar, cards, tabs and back arrow are not semantic elements**
- Page: global
- S: Inspect the sidebar in the accessibility tree, or middle-click an item.
- E: `<a href>` or `<button>` with roles and names.
- A: Generic divs with a pointer cursor. No `href`s, no open-in-new-tab, and no roles for screen readers.
- Shot: deep/02, deep/11 (from Atlas's a11y-tree notes)
- Fix: Use router `<Link>` (or RN-web `accessibilityRole="link"` with `href`) for nav. Use buttons for actions and `role="tablist"` for tabs.

**CS-6: Crew counts disagree across views**
- Page: `/crew`, `/projects`, `/project?id=sample-project-1` (Crew tab)
- S: Compare the Fleetwood counts.
- E: The same crew everywhere.
- A:
  - Crew Board header: Fleetwood "3 crew", Sherman Rd "4 crew", but only one tick per site in the matrix.
  - Projects page: "3 workers" for Fleetwood.
  - Crew tab: 3 people (Gurkanwal, Mowgli, Navdeep).
  - Crew Board shows only Navdeep on Fleetwood.
- Shot: deep/10, deep/17, deep/29
- Fix: Derive all counts from one source, the project's members. List every member in the matrix, or explain why some are filtered out (for example, the role filter).

### Medium

**CS-7: No persistent navigation on mobile**
- Page: 390 px, all pages
- S: At 390 px, try to get from the project page to Users.
- E: A bottom bar or hamburger menu.
- A: Only the back arrow. It takes 2-3 backs to switch section.
- Shot: deep/30-32, deep/36
- Fix: Add a bottom tab bar or drawer.

**CS-8: Raw form IDs instead of titles**
- Page: project Forms tab, `/search`
- S: Open Fleetwood → Forms.
- E: "Daily FLHA — …"
- A: `flha-daily-v1` and `flha-brownbros-v1`, plus truncated snippets in Search.
- Shot: deep/26, deep/37, deep/04
- Fix: Look up the template title, and fall back to the ID only when there is no title.

**CS-9: Low text contrast**
- Page: Safety ("no work"), Lifecycle disabled button, form placeholders, "Coming soon", "on the bench"
- S: View these pages.
- E: 4.5:1 for text and 3:1 for UI (WCAG 1.4.3).
- A: Very light grey, visually estimated at about 1.5-2:1. Not measured.
- Shot: deep/21, deep/35, deep/23, deep/36, deep/12, deep/15, deep/18
- Fix: Darken the grey tokens (for example #6B7280 or darker on off-white).

**CS-10: Tap targets below 24-44 px**
- Page: role chips on Users, range chips on Hours, pencil/chevron on Projects, header + and ×, archive icon, mobile Crew Board cells
- E: At least 24 px (WCAG 2.5.8); 44 px recommended for gloved field use.
- A: About 16-24 px.
- Shot: deep/09, deep/13, deep/17, deep/20, deep/33
- Fix: Add padding or hit-slop up to 44 px.

**CS-11: Small body text on desktop**
- Page: global (sidebar, captions, chips)
- A: About 10-11 px at 1920 wide.
- Shot: deep/07, deep/10
- Fix: Use a 14-16 px base and scale the captions up.

**CS-12: Inconsistent or missing keyboard focus**
- Page: global
- S: Tab through the dashboard and sidebar.
- E: A visible focus ring on every interactive element, in a logical order.
- A: A heavy black ring on dashboard cards. No visible focus on the sidebar or tabs, and the sidebar may not be in the tab order.
- Shot: deep/02, deep/31
- Fix: Use a consistent `:focus-visible` style and make nav items focusable.

**CS-13: Focus ring sticks after navigating back**
- Page: `/dashboard`
- S: Open the Projects card, then go back.
- A: The card keeps its black ring.
- Shot: deep/31, deep/32
- Fix: Use `:focus-visible` only, or blur on route change.

**CS-14: aria-hidden on an element whose descendant has focus**
- Page: `/safety`, `/project?id=sample-project-1`
- A: The console warns "Blocked aria-hidden on an element because its descendant retained focus".
- Shot: deep/39
- Fix: Use `inert` instead of `aria-hidden`, or move focus out before hiding (a modal or hidden-screen pattern).

**CS-15: Edit project form doesn't match New project**
- Page: `/projects` (pencil icon)
- A: New project has a geofence section (default on, 150 m, Maps link). Edit has only a "GPS geofence" toggle, which is off for Fleetwood, and no coordinates.
- Shot: deep/18, deep/19
- Fix: Share one form component, and show the stored coordinates and radius.

**CS-16: Fillable form rows on /library do nothing**
- Page: `/library`
- S: Click a form row.
- E: Preview or open.
- A: No action. Only the archive icon responds.
- Shot: deep/20
- Fix: Make the row open a preview.

**CS-17: Project tab bar overflows on mobile with no cue**
- Page: `/project` at 390 px
- A: The tab bar scrolls sideways, and "Forms" is cut off.
- Shot: deep/36
- Fix: Add a fade or scroll indicator, or icon-only tabs.
- NOTES rated this Low. Raised to Medium because it hides FLHA forms.

**CS-18: Crew Board matrix unusable on mobile**
- Page: `/crew` at 390 px
- A: Only 1 of 4 sites is visible, and names and counts are cut off.
- Shot: deep/33
- Fix: Use a per-site list or card layout on narrow screens.
- NOTES rated this Low. Raised to Medium.

**CS-19: Icon font loads late (Feather.ttf, about 400 KB)**
- Page: global
- A: Chrome logs "Slow network detected". Fallback glyphs show on slow networks.
- Fix: Subset or inline SVG icons, preload them, and use `font-display`.
- NOTES rated this Low. It is grouped here with the console notices and kept at Medium because it adds to CS-1.

### Low

**CS-20: No sidebar item is active on the project page**
- Page: `/project?id=…`
- Shot: deep/23
- Fix: Highlight Projects.

**CS-21: Back arrow and header styles are inconsistent**
- Compliance uses a "‹" chevron and a left-aligned title. Header heights also vary between pages.
- Shot: deep/22 vs deep/20, deep/21; deep/07, deep/10 vs deep/04, deep/11
- Fix: Use one shared header component.

**CS-22: "All certs" duplicates Compliance**
- The Safety "All certs" button and the dashboard "Cert expiries" link both open `/compliance`.
- Shot: deep/22
- Fix: Keep one entry point, or name both the same.

**CS-23: Site order differs between pages**
- Safety lists cook / Sherman / tsawout / Fleetwood. Projects lists Fleetwood / Sherman / cook / tsawout.
- Shot: deep/21 vs deep/17
- Fix: Use one sort order everywhere.

**CS-24: Site name and address formatting**
- "cook  street townhomes" has a double space and is lower case. Addresses are lower case.
- Shot: deep/17
- Fix: Trim and normalize on save. Clean up the existing data.

**CS-25: Ambiguous "Nav" sign-out label, plus a second unlabeled logout icon**
- Shot: deep/02, round4/07
- Fix: Label it "Sign out (Nav Rai)" and remove the duplicate icon.

**CS-26: Phone numbers and emails are plain text**
- Page: Users, project Crew tab
- Shot: deep/12, deep/29
- Fix: Use `tel:` and `mailto:` links.

**CS-27: "Form Builder – Coming soon" tile looks like a card**
- Shot: deep/02, deep/32
- Fix: Use a distinct disabled style or hide the tile.

**CS-28: Desktop layout wastes width**
- Search, Inbox, Clients, Forms, Lifecycle and Timeline use a narrow centred column, while other pages are full width.
- Shot: deep/04, deep/20, deep/02
- Fix: Use consistent max-width rules.

**CS-29: Empty "ALL ENTRIES" heading and an unlabeled download icon on Hours**
- Shot: deep/09, round4/08
- Fix: Add an empty message and an accessible label for the icon.

**CS-30: Inconsistent header actions**
- Some pages use coloured text actions, others icon-only (+, add person, download).
- Shot: deep/07, deep/14, deep/17
- Fix: Use one header action pattern, with labels.

**CS-31: Lifecycle "Clear the checklist to advance" button**
- The disabled button gives no hint about which items block it.
- Shot: deep/23, deep/36
- Fix: List the outstanding items.

**CS-32: Dashboard placeholders while loading**
- Shows "–" and "Checking every job…" with no skeleton. This is a symptom of CS-1.
- Shot: deep/01
- Fix: Add skeleton loaders.

**CS-33: Dashboard job cards show instructional text as status**
- Example: "Link the client: Clients → add the GC/owner…" in small red-icon rows. The guidance is useful, but it reads as an error.
- Shot: round4/07
- Fix: Separate the "next step" styling from error styling.

**CS-34: Project tab content in a narrow column with a large empty area**
- Applies to the Photos, Punch List and Daily Logs empty states.
- Shot: 01_lifecycle_crew_step_spinner_stuck.png (actually shows Photos), 04_forms_list_pdf_rendering.png (actually Punch List)
- Fix: Add a call to action in empty states (for example "Add first punch item").

**CS-35: Clients list has only one record (Brown Bros) and no search or filter**
- Fine for now, but it won't scale.
- Shot: deep/14
- Fix: Add search once there are more than about 10 clients.

**CS-36: Hours project chip text is truncated and lower-case site names show in chips**
- Visible in the chip row.
- Shot: round4/08, deep/09
- Fix: Follow CS-24, and add a tooltip or wrap long names.

> CS-31 to CS-36 were not in NOTES.md. They are additions from viewing the screenshots.

### 3.1 Status of earlier-round issues
Rounds 1-3 have no written notes. Their issues were inferred from the screenshot filenames and content. Round 1 is the top-level `01_…07_` files.

| Earlier issue | Source | Status (from deep pass) |
|---|---|---|
| Lifecycle crew step spinner stuck | round 1 `01_lifecycle_crew_step_spinner_stuck.png` | **Unverified.** The file actually shows the Photos tab with no spinner. deep/23 Lifecycle has no stuck spinner, so this looks fixed but can't be confirmed |
| Photos, Documents, Punch List, Daily Logs empty | round 1 02, 03, 05, 06; round2 02, 03, 06, 07 | **Still present** as empty states (deep/24-28). Expected given the data. See CS-34 |
| Forms list / PDF rendering | round 1 04 (shows Punch List); round2 04-05; round3 16; round4 04 | **PDF opens (fixed or OK).** Raw form IDs **still present** (CS-8) |
| Crew tab loading spinner | round2/08 | **Looks fixed.** deep/29 loads, but the overall slowness remains (CS-1) |
| Crew tab members | round 1 07; round2 09; round3 03; round4 02 | **Still present:** mismatch with the Crew Board (CS-6) |
| Crew Board / Users duplicate Navdeep | round4 05, 06 | **Still present** (deep/10, 11). CS-3 |
| Projects click → dashboard; /projects and /forms → dashboard | round4 07, 09 | **Still present or intermittent.** deep/17 shows /projects rendering once. CS-2 |
| Hours redirects to Reports | round4/08 | Not a bug: Hours & Reports is a single `/reports` page. **Works** |
| Safety Center "–" Worst site FLHA | round3/13, round4/11 | **Still present** (deep/21). CS-4 |
| Search / Inbox / Timeline / Money / Library / Compliance pages | round3 05-15; round4 10 | Pages render. Related issues are still present (CS-8, CS-4, CS-28) |

---

## 4. Coverage gaps and recommended next pass

**Could not be verified from screenshots:**
- Keyboard: full tab order, focus traps in forms and dialogs, Escape to close, skip link.
- Screen reader output (NVDA or VoiceOver). The a11y-tree note covers the sidebar only.
- Measured colour contrast ratios. All contrast figures here are visual estimates.
- Lighthouse, Core Web Vitals (LCP, INP, CLS), bundle size and network waterfall timings. The load times quoted are Atlas's observations, not measurements.
- Full console and network logs per page. Only deep/39 was captured.
- Manager and Worker roles, signed-out redirects, direct-URL access to admin pages, and Firestore security rules (PII: staff emails and phones).
- Form validation and every write flow: create, edit, upload, archive, crew assignment, role chips, geofence save.
- 375 px, 768 px and real devices (iOS Safari, Android Chrome). Offline and poor-network behaviour on site.
- Project detail for the other 3 projects, and the Users "Full profile" screen.
- PDF content fidelity of the submitted FLHAs.

**Recommended next pass:**
1. Set up a staging or seeded test tenant, so write flows and validation can be tested without touching production data.
2. Run Playwright smoke tests for every route, deep link and reload, plus an axe-core scan per page.
3. Run Lighthouse (mobile and desktop) on /dashboard, /crew and /project, and capture HAR files to diagnose the Firestore Listen errors.
4. Do a manual keyboard and screen-reader pass (NVDA and VoiceOver), and measure contrast with a contrast checker.
5. Test the role matrix with Admin, Manager, Worker and signed-out accounts, and review the Firestore rules.
6. Repeat the responsive checks at 375, 390 and 768, plus one real iPhone and one real Android device.
7. Retest CS-1 to CS-6 after the fixes land.
