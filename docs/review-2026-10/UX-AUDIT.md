# Consite — UX & Design Audit · v2
> **v2 (22 Oct 2026, 18:30 PT):** reviewed Atlas's signed-in deep capture `consite-review/deep/` (38 screenshots plus NOTES.md, desktop 1920 and mobile 390). I corrected N1/N2, confirmed most v1 findings, added §9 Mobile, §10 Semantics/keyboard and §11 Data trust, and updated the unverified list. Evidence prefixed `deep/` refers to that folder.

Prepared for Zara (Creative Director) / Atlas (MD), Jungle Labs · 22 Oct 2026 · read-only audit

**Method.** I reviewed all 43 QA screenshots in `/workspace/consite-review/` (7 at the root, plus round2: 9, round3: 16, round4: 11). The live app (`https://consite-production.up.railway.app`) redirects every route to `/login` (screenshot `evidence/live-login-390.png` was 390 px). No credentials were tried, so everything inside the app is judged from the QA screenshots. Those are all desktop captures at 1280×800 or 1024×594. **The in-app mobile layout could not be verified.** No app source was found on the box (searched /workspace). No data was changed.
Contrast ratios are computed with the WCAG 2.x formula against the app's palette as read from screenshots and from the login page's computed styles. The palette looks like Tailwind stone + orange: text `#1C1917` / `#78716C` / `#A8A29E` on `#FAFAF9`, with an orange-600-ish accent.

## Executive summary
Consite is clean, calm and consistent. It has a sensible orange/stone palette, a helpful Dashboard "jobs at a glance" row and a real project lifecycle model, so the foundations are good. It is not yet field-ready, for four reasons:
1. **Too small for gloves and sunlight.** Body text is about 11–13 px. Secondary text is light grey (`#A8A29E` = **2.4:1**, which fails AA). Tabs, sidebar rows and list chips are roughly 28–36 px tall, well under 48 px.
2. **Navigation is broken or duplicated.** There are 13 flat sidebar items, and the Dashboard repeats them as 13 tiles. *Projects* opens the Dashboard (round4/07), the *Hours* link redirects to Reports (round4/08), and `/projects/forms` drops you on the Dashboard (round4/09). *Crew Board* and *Users* each show up twice (round4/05, 06).
3. **Hierarchy is weak.** The Dashboard puts identity and three counters first. The things that actually need action, like a blocked lifecycle step or a missing FLHA, sit in tiny red text inside cards. There's no "what do I do next".
4. **Loading, empty and offline states are thin.** The Crew step spinner gets stuck (01_lifecycle_crew_step_spinner_stuck, round2/08). Empty states are a grey icon plus one line with no primary action. Photos is the exception (round2/02). There's no sign of sync or offline status anywhere.

Fixing type size, contrast, tap targets and the nav bugs is roughly 3–4 dev-days, and it would move Consite from "tidy prototype" to "credible field tool". The mockups show the bigger step: an action-first dashboard, a guided lifecycle checklist and a column-based Crew Board, all with mobile bottom-tab navigation.

Severity key: **S1** blocks a task or fails accessibility · **S2** real friction · **S3** polish.

---
## 1. Navigation
| # | Finding | Evidence | Sev | Recommendation |
|---|---|---|---|---|
| N1 | **v2 corrected:** `/projects` exists and lists 4 projects with stage and worker count (deep/17). The round4/07 behaviour wasn't reproduced and may have been a timing issue with the div-based nav (see K1). What remains: rows are thin, the pencil and chevron are about 16 px, and there's no search or filter. | deep/17, round4/07 | S2 | Make each project row a full-width link of at least 64 px with a status pill and step label. Add search and filter. |
| N2 | **v2 corrected:** Hours lives at `/reports` (deep/08–09), which is by design. Typed or guessed URLs still fall back silently to the Dashboard. | round4/09, deep/09 | S3 | Add a 404 page with a way back. Make the URL match the label (`/hours`). |
| N3 | Duplicated pages/entries: Crew Board and Users | round4/05-crew-board-dup, round4/06-users-dup | S2 | One canonical page per entity, merging Users into Crew > People |
| N4 | 13 flat sidebar items with no grouping, and the Dashboard repeats all 13 as tiles ("Today"/"Manage") | round3/04-dashboard.png | S2 | Group them as Today / Sites / Safety / Admin and cut to about 8. Remove the tile grid from the Dashboard. |
| N5 | Page headers use a back arrow plus a centred title. "Back" from a top-level page is ambiguous, and there are no breadcrumbs. | round3/05, 06, 11 | S3 | Use left-aligned titles and breadcrumbs (Projects › Site › Tab). Keep back arrows only for drill-ins. |
| N6 | Project tabs (Lifecycle…Crew) are small text tabs without counts, so you can't tell what's empty without opening each one. | round2/01–09 | S2 | Show counts on tabs (e.g. "Forms 5"). Make tabs 52 px tall and horizontally scrollable on mobile. |
| N7 | **v2 confirmed, S1:** at 390 px the sidebar disappears and nothing replaces it. There's no bottom bar or hamburger. Every section is reached from the Dashboard tile list, which is about 3 screens long, and then via back arrows. Moving from a project to another section takes 2–3 backs. | deep/30–32, deep/36 | **S1** | Add a bottom tab bar (Home, Sites, + Log, Crew, Inbox) with 60 px items, a central FAB, and a "More" sheet for the admin pages. See the mockups. |

## 2. Information hierarchy
| # | Finding | Evidence | Sev | Recommendation |
|---|---|---|---|---|
| H1 | Dashboard order is: user email/role, then three counters (two of them showing 0), then jobs, then nav tiles. Actionable problems are buried as 11 px red lines inside job cards. | round3/04-dashboard.png | S1 | Lead with "Needs your attention", a ranked list with one CTA per item (see mockup). |
| H2 | Job cards show a segmented bar with no step labels, plus a ratio like "1/3 ✓" that's hard to parse | round3/04 | S2 | Label it "Step 2/6 · Crew" and add a status pill (On track / Blocked / FLHA missing). |
| H3 | Lifecycle: the six step circles are about 20 px with 9 px labels. The disabled primary "Start the next step" button is grey on grey and doesn't say why it's disabled. | round3/01, round4/01 | S1 | Use large step cards and say "Finish 2 items first". Mark blocking items in red. |
| H4 | Crew Board is a matrix of tiny ticks with a legend in 9 px text. The legend is needed just to read it. | round3/10-crewboard.png | S2 | Use site columns with people cards and state pills (FLHA signed/missing). Offer Today/Tomorrow/Week. |
| H5 | Money and Safety KPIs show "–" with no explanation | round3/08, round3/13 | S3 | Show "No data yet" with a line on how it fills up. |
| H6 | Search result snippets are long, run-on text with no highlighted matches | round3/05, round4/10 | S3 | Bold the matched terms. Show type, project and date in a meta row. Group results by type. |

## 3. Visual design (type, colour, spacing, consistency)
| # | Finding | Evidence | Sev | Recommendation |
|---|---|---|---|---|
| V1 | Base type is about 12–13 px and secondary text about 10–11 px (at 1280 wide). Titles are only about 14 px. Too small for a site tablet held at arm's length. | all | S1 | Body 16 px, secondary 14–15 px, titles 26–30 px (see tokens). |
| V2 | Content is a narrow centred column (~380 px) on a 1280 px canvas, leaving lots of dead space (Forms, Crew, Search) | round2/04, round3/02, round3/05 | S2 | Use a fluid content width up to 1200 px, plus 2-column layouts on desktop. |
| V3 | Inconsistent page patterns: some pages have centred titles (Search, Users), some left (Money, Safety, Compliance). Primary actions sit in the top-right corner as small orange icons (Users +, Clients +). | round3/08, 11, 12, 14 | S2 | Use one page-header component: eyebrow, H1, actions on the right as labelled buttons. |
| V4 | Compliance uses saturated pastel blocks (pink/yellow/mint) that don't match the rest of the app's restrained style | round3/14-compliance.png | S3 | Use neutral cards with coloured numbers and pills, from the shared status tokens. |
| V5 | Orange is used for avatar placeholders, links, active nav, CTAs and warnings, so it doesn't signal anything | round3/11, round2/09 | S2 | Keep orange for primary action and brand. Use dark neutral avatars. Status colours only mean status. |
| V6 | Internal/dev copy is visible: "Crew — what the app can verify", "Promote one crew member: Users → expand → tap the role chip", "v0.3 ... coming" | round3/01, round3/14 | S2 | Rewrite microcopy in plain field language and put actions behind buttons. |

## 4. Mobile & field use
| # | Finding | Evidence | Sev | Recommendation |
|---|---|---|---|---|
| F1 | Tap targets are under 48 px. Sidebar rows are about 30 px, project tabs about 28 px, range chips ("Last 7 days") about 22 px, Crew Board cells about 26 px, the lifecycle checklist checkbox about 14 px, and the phone icon about 20 px. | round3/09, round3/10, round4/01, round2/09 | S1 | 48 px minimum for every control and 52–56 px for primaries, with ≥8 px gaps. Make whole rows tappable. |
| F2 | Light-grey secondary text and the grey disabled button will vanish in sunlight | round3/01, round3/04 | S1 | Use ≥7:1 for body text outdoors (ink `#111827`, secondary `#4B5563` = 7.6:1). |
| F3 | There's no offline, sync or "last updated" indicator anywhere, and a stuck spinner gives no timeout or retry | 01_lifecycle_crew_step_spinner_stuck, round2/08-crew-loading | S1 | Show a sync pill in the header (Synced / Offline, 3 queued). Use skeletons, not spinners, plus a retry after 8 s. Queue form and photo submissions offline. |
| F4 | Field-first actions (log a photo, sign FLHA, report an issue) aren't one tap away. The Dashboard is office-centric. | round3/04 | S2 | Add a role-aware home (a Foreman view) and a central "+ Log" FAB covering Photo, FLHA, Daily log, Issue. |
| F5 | **v2:** mobile is now verified from deep/30–38. See §9. | deep/30–38 | — | — |

## 5. Onboarding
| # | Finding | Evidence | Sev | Recommendation |
|---|---|---|---|---|
| O1 | Login offers "Ask your project admin to create one", and there's no product intro or first-run guidance | evidence/live-login-390.png | S2 | First-run checklist on the Dashboard (Add a client → Create site → Invite crew → First FLHA), with progress. |
| O2 | Setup instructions live in tiny helper text, e.g. "Clients → add the GC/owner, then select them on this project" | round3/04 | S2 | Turn each instruction into a button that opens the right picker in place. |
| O3 | The test account "test user" and duplicate admin accounts are visible in production lists | round3/11, round3/10 | S3 | Seed clearly labelled demo data, or hide test accounts. |

## 6. Empty states
| # | Finding | Evidence | Sev | Recommendation |
|---|---|---|---|---|
| E1 | Photos, Documents, Punch list, Daily logs and Timeline use a grey icon plus one grey line, with no CTA (round2 added CTAs to Photos and Docs only) | 02_photos_empty, 03_documents_empty, 05_punch_list_empty, 06_daily_logs_empty, round3/07 | S2 | Use one consistent component: illustration-icon, a title ("No daily logs yet"), one sentence of why, and a primary CTA (≥52 px). |
| E2 | Inbox "All caught up" is good but tiny | round3/06 | S3 | Make it bigger, add a subtle success icon and a "View all" link. |
| E3 | Hours & Reports says "No shift hours in this range" under a huge orange "Audit pack" CTA, which is the wrong emphasis | round3/09 | S2 | Make the export secondary when there's no data and suggest widening the range. |

## 7. Forms & checklists
| # | Finding | Evidence | Sev | Recommendation |
|---|---|---|---|---|
| C1 | Form submissions are listed as raw slugs like "flha-brownbros-v1" with a "PDF rendering" status | 04_forms_list_pdf_rendering, round2/04 | S2 | Use a human title ("Daily FLHA · Site 2 · 22 Oct"), the submitter's initials and a status pill. |
| C2 | Opening a form leaves the app for a raw Firebase-storage PDF URL in a new tab | round3/16, round4/04 | S2 | Open an in-app viewer with Back, Share and Download. Use signed short links. |
| C3 | The generated PDF (round3/16) has weak hierarchy and the signature is barely visible. The template version (round4/04) puts a tiny "Ja" in a giant field. | round3/16, round4/04 | S2 | Use a branded PDF template: header band, sections, legible 11 pt, signature box with name and timestamp. |
| C4 | Lifecycle checklist rows use small radio-like circles. They look like inputs but are system-checked, which is confusing. | round3/01 | S2 | Use 32 px check boxes plus an inline action button per item. Mark items that are auto-verified vs manual. |
| C5 | "Build phases" chips ("+ House Framing") are about 20 px tall | round3/01 | S2 | Use a 52 px row list with drag handles and an "Add phase" button. |

## 8. Accessibility (WCAG 2.2 AA)
Computed contrast on white `#FFFFFF` and page bg `#FAFAF9`:

| Pair | Ratio | AA normal (4.5) | Where |
|---|---|---|---|
| `#1C1917` stone-900 text / white | 17.5:1 | ✅ | titles |
| `#78716C` stone-500 / `#FAFAF9` | 4.59:1 | ✅ barely (fails 7:1 outdoor target) | subtitles, helper text |
| `#A8A29E` stone-400 / `#FAFAF9` | **2.41:1** | ❌ | login footer, timestamps, legends, empty-state text |
| white / `#EA580C` (sign-in & CTA buttons) | **3.56:1** | ❌ for 15–16 px text (needs ≥18.66 px bold) | Sign in, Audit pack, Upload PDF |
| `#EA580C` orange text / white | **3.56:1** | ❌ | links, "+ Users", role chips |
| `#F97316` orange-500 / white | **2.80:1** | ❌ | step dots, active tab underline/text |
| `#16A34A` green-600 / white | **3.30:1** | ❌ | "ADMIN — full access", ticks |
| `#D6D3D1` disabled button bg vs white | 1.49:1 | ⚠ (disabled is exempt, but the label is unreadable) | "Start the next step" |
| Proposed `#C2410C` / white | **5.18:1** | ✅ | new brand/CTA |
| Proposed `#15803D` / white | 5.0:1 | ✅ | new ok |
| Proposed `#4B5563` / white | 7.56:1 | ✅ AAA | new secondary |

Other a11y findings:
- **A1 (S1):** Fix the contrast failures above by swapping tokens (quick win).
- **A2 (S2):** Icon-only buttons (phone, sign-out, + on Users/Clients/Projects, download on Hours) have no visible label (deep NOTES #30). The sidebar footer "Nav" is a sign-out, and there's a second unlabeled logout icon on the Dashboard (deep/02). Add `aria-label`s and a single labelled "Sign out" button.
- **A3 (S2, v2 updated):** A focus ring does exist, but only on Dashboard cards (heavy black outline, deep/02). No visible focus style appeared on the sidebar or the tabs. Use one `:focus-visible` style (3 px `#111827` outline, 2 px offset) on every control. See K2 and K3.
- **A4 (S2):** Status on the Crew Board and job bars relies on colour alone (green, orange, red segments). Add text or icons (1.4.1).
- **A5 (S3):** Login uses visible labels (good). Placeholder `#A8A29E` sits at about 2.4:1. Darken it to `#6B7280` (4.8:1).
- **A6:** Target size 2.5.8 (24 px min, AA) fails on range chips and Crew Board cells. Our field target is 48 px.

---
## 9. Mobile at 390 px (new in v2, from deep/30–38)
| # | Finding | Evidence | Sev | Recommendation |
|---|---|---|---|---|
| M1 | **No persistent mobile navigation.** There's no bottom bar or hamburger. The Dashboard tile list, about 3 screens of scroll, is the only nav. (Same issue as N7.) | deep/30, 31, 32, 36 | **S1** | Bottom tab bar plus FAB, as in the mockups. Keep the browser back button working with real routes. |
| M2 | Crew Board matrix scrolls sideways, so only 1 of 4 sites shows and the column names are cut off. The legend is about 9 px. | deep/33 | S2 | On mobile, show one stacked card per site with a people list and FLHA/first-aid pills (crewboard-mobile mockup). |
| M3 | Project tab bar overflows with no scroll cue. "Forms" is cut off on first view. Tabs are about 40 px tall. | deep/36, 37 | S2 | Use 52 px tabs, an edge fade or chevron cue, and counts. Or move the secondary tabs into a "More" sheet. |
| M4 | The lifecycle checklist is readable, but the step dots are about 24 px with 9 px labels. The disabled "Clear the checklist to advance" is light grey on grey, roughly 1.5:1. The template chips ("+ House framing") are about 28 px. | deep/36 | S1 | Use step cards, a sticky primary CTA that names the next action ("Choose foreman"), and 52 px rows (lifecycle-mobile mockup). |
| M5 | Dashboard cards are about 56–64 px (good), but the stat captions ("On site now") are about 10 px and the job-card helper text is about 10 px light grey. | deep/30 | S2 | Use 14 px captions in `#4B5563` and lead with the "Needs attention" list. |
| M6 | Safety Center: "no work" labels in very light grey (about 2:1), and three KPI tiles showing "–" or "0" | deep/35 | S2 | Use the neutral pill "No activity in 14 days" in `#4B5563` and explain the time window. |
| M7 | Forms & Documents rows are good-sized (about 56 px), but the archive icon is the only active target and the row itself does nothing. "Upload PDF" is about 28 px. | deep/34, deep/20 | S2 | Make the whole row open a preview. Use a 52 px "Upload PDF" button. Put the icon actions in an overflow menu. |
| M8 | Project Crew tab: phone and email are plain text. Only the ~20 px phone icon can be tapped. | deep/38, deep/29 | S2 | Use a 48 px call button and `tel:` / `mailto:` links on the text. |

## 10. Semantics, keyboard & focus (new in v2)
| # | Finding | Evidence | Sev | Recommendation |
|---|---|---|---|---|
| K1 | **Sidebar items, dashboard cards, the header back arrow, project tabs and list rows are plain `div`s with a pointer cursor, not links or buttons.** There are no `href`s, so no open-in-new-tab and no middle-click. Screen readers announce them as text, and keyboard reach isn't reliable. | deep/02, deep/11, NOTES #5 | **S1** (WCAG 4.1.2, 2.1.1) | Use `<a href>` for navigation (sidebar, cards, rows, back) and `<button>` for actions. Project tabs get `role="tablist"`/`tab` with arrow-key support. In React Native Web, use `accessibilityRole="link"` with `href`, or `"button"`/`"tab"`. Estimate 1–1.5 d. |
| K2 | **Focus ring sticks after going back.** The "Projects" card keeps its black outline on return to the Dashboard, which looks like a selected state. | deep/02, deep/31, deep/32 | **S2** | Style `:focus-visible`, not `:focus`, so mouse and touch don't leave rings. On route change, move focus to the page `<h1>` (tabindex=-1) instead of restoring it to the clicked card. Estimate 0.5 d. |
| K3 | Focus styling is inconsistent: a heavy ring on cards, none on the sidebar or tabs | deep/02, NOTES #6 | S2 | One focus token everywhere (3 px `#111827`, 2 px offset, with a white inner ring on dark surfaces) |
| K4 | Console: "Blocked aria-hidden on an element because its descendant retained focus" on /safety and /project. A hidden screen still holds focus. | deep/39 | S2 | Use `inert` on inactive screens, or blur and move focus before hiding. Don't use `aria-hidden` on containers with focus. |
| K5 | The project page has no active sidebar item | deep/23 | S3 | Highlight "Projects" and show the breadcrumb Projects › Site. |

## 11. Performance, loading & data trust (new in v2)
| # | Finding | Evidence | Sev | Recommendation |
|---|---|---|---|---|
| P1 | Cold load takes about 15 s and Crew Board about 20 s. Search, Hours, Timeline and Safety show a 5–10 s spinner. A deep-route reload shows a blank grey page. Firestore `Listen/channel` errors (400 / connection closed) repeat in the console. | deep/01, 03, 08; NOTES #1–2 | **S1** | Engineering: fix the listener errors and fall back to long polling. Design: app-shell skeletons, cached last-known data with an "Updated 2 min ago" stamp, and the sync pill. |
| P2 | The 400 KB Feather.ttf icon font loads late, so icons fall back to the wrong glyphs | NOTES #4 | S3 | Use an inline SVG icon set (as in the mockups), which can be tree-shaken |
| D1 | **Misleading "all clear".** Compliance shows a green "All clear" with 0/0/0 certs, while Crew Board says "No first aid" on all 4 sites. Safety shows "–" and 0 because of the 14-day window. | deep/22, 21, 10, 23 | **S1** (safety) | Show an empty state, not a success state, when there's no data: "No certificates on file — 4 sites lack first aid", in red. |
| D2 | Crew counts disagree. Headers say "3 crew" / "4 crew" while the matrix shows 1 per site, and the project Crew tab shows 3 different people. | deep/10, 17, 29 | S1 | Use one source of truth for assignment. Until then, label which count is which ("3 on project · 1 today"). |
| D3 | Two users have the same display name, and Crew Board shows no email to tell them apart | deep/10, 11 | S2 | Add a secondary identifier (role, last 4 digits of phone) and initials avatars with a colour index. |
| D4 | Site names aren't normalised ("cook  street townhomes" with a double space, lower case). Site order differs between Safety and other pages. | deep/17, 21 | S3 | Trim and title-case on display, and use one sort order (by status, then name). |
| D5 | "Coming soon" Form Builder tile and "Coming in v0.3" banner shown in the product | deep/02, 32, 22 | S3 | Hide unreleased features, or move them to a single "What's next" note. |
| D6 | New project and Edit project forms differ: New has a geofence radius, Edit only has a toggle with no coordinates | deep/18, 19 | S2 | Use one shared project form component, with the geofence shown on a map preview. |

---
## Design tokens (adopt as CSS variables / Tailwind theme)
```css
/* colour */
--bg:#F5F5F2; --surface:#FFFFFF; --line:#D9D9D3;
--ink:#111827 (17.7:1); --ink-2:#374151 (10.3:1); --ink-3:#4B5563 (7.6:1);
--brand:#C2410C (white text 5.18:1); --brand-soft:#FFF1E8; --nav:#111827;
--ok:#15803D / --ok-soft:#E7F6EC;  --warn:#A16207 / --warn-soft:#FEF6DC;  --bad:#B91C1C / --bad-soft:#FDECEC;
/* type — Inter/system-ui */
12 caption-caps (700, +.06em) · 14 meta · 16 body · 17 list-title (700) · 20 section (800) · 26/30 page H1 (800, -.02em) · 36 KPI (800)
line-height 1.45 body / 1.15 headings
/* spacing (4-pt) */ 4 · 8 · 12 · 16 · 24 · 32 · 48
/* radius */ 9 (controls-inner) · 12 (buttons, rows) · 14–16 (cards, columns) · 999 (pills)
/* touch */ --tap:52px primary · 48px minimum · 8px min gap · bottom bar items 60px
/* focus */ outline:3px solid #111827; outline-offset:2px
/* elevation */ borders over shadows; only FAB gets shadow 0 6 16 rgba(194,65,12,.35)
```
Components to standardize: PageHeader, StatusPill (ok/warn/bad/neutral, always with text), KPI card, ActionRow (icon + title + meta + CTA), ChecklistItem (32 px box, auto/manual, inline action), EmptyState, SyncPill, BottomTabBar + FAB, Skeleton.

---
## Prioritized fix list
### Quick wins (each < 1 day)
| # | Fix | Effort |
|---|---|---|
| 1 | Fix routing: Projects → real list (even a simple one), Hours route, `/projects/forms`, 404 page (N1, N2) | 1 d |
| 2 | Swap colour tokens: brand `#C2410C`, secondary text `#4B5563`, ok `#15803D`, kill `#A8A29E` for text (A1, F2) | 0.5 d |
| 3 | Bump type scale: body 16, meta 14, H1 26–30 (V1) | 0.5 d |
| 4 | Enforce a 48 px minimum on nav rows, tabs, chips, icon buttons and checkboxes; make whole rows tappable (F1) | 1 d |
| 5 | Stuck spinner: add an 8 s timeout, a retry and skeleton loaders on project tabs (F3) | 0.5 d |
| 6 | Remove duplicate Crew Board/Users entries; group the sidebar into 4 sections (N3, N4) | 0.5 d |
| 7 | Remove the nav-tile grid from the Dashboard (N4) | 0.25 d |
| 8 | Empty-state component with title, sentence and CTA across Photos/Docs/Punch/Logs/Timeline (E1) | 0.5 d |
| 9 | Disabled CTA explains why ("Finish 2 items first"); count badges on project tabs (H3, N6) | 0.5 d |
| 10 | Focus ring, `aria-label`s on icon buttons, text alongside colour status (A2–A4) | 0.5 d |
| 11 | Human-readable form titles and status pills; rewrite dev microcopy (C1, V6) | 0.5 d |
| 12 | **v2:** Swap div nav to `<a href>`/`<button>`/tabs roles (K1) | 1–1.5 d |
| 13 | **v2:** `:focus-visible` only, plus focus to `<h1>` on route change, which fixes the stuck ring (K2, K3) | 0.5 d |
| 14 | **v2:** Replace false "All clear" with an honest empty state; reconcile the crew count labels (D1, D2) | 0.5–1 d |
| 15 | **v2:** Tab-bar scroll cue, `tel:`/`mailto:` links, 52 px Upload PDF and template chips (M3, M7, M8) | 0.5 d |
| 16 | **v2:** Fix aria-hidden/focus warnings with `inert` (K4) | 0.25 d |

### Bigger redesigns
| # | Redesign | Effort |
|---|---|---|
| A | Action-first Dashboard ("Needs your attention", labelled site progress, sync pill), with a role-aware Foreman home (H1, H2, F4) — see mockup | 3–5 d |
| B | Guided Lifecycle: step cards, a checklist with inline actions and blocking reasons, a sticky mobile CTA, a build-phase list (H3, C4, C5) — see mockup | 4–6 d |
| C | Crew Board as site columns with people cards, drag/tap assign, FLHA state, Today/Tomorrow/Week (H4) — see mockup | 4–6 d |
| D | **Priority 1 (v2: S1 confirmed).** Mobile shell: bottom tab bar plus a "+ Log" FAB (Photo/FLHA/Daily log/Issue), a "More" sheet, responsive layouts on every page (N7, M1, F4) | 4–5 d |
| I | **v2:** Performance and perceived speed: fix the Firestore listeners, app-shell skeletons, cached data with freshness stamps, SVG icons (P1, P2) | 4–6 d (eng + design) |
| E | Offline-first: service worker, IndexedDB queue for forms and photos, sync pill, conflict messaging (F3) | 8–12 d |
| F | In-app PDF/form viewer plus a branded FLHA PDF template (C2, C3) | 3–4 d |
| G | Onboarding checklist and seeded demo project; inline pickers replace "go to X then Y" instructions (O1, O2) | 3 d |
| H | Design-system pass: tokens, PageHeader, StatusPill, ActionRow, EmptyState; unify Compliance/Money/Safety (V3–V5) | 3–4 d |

## Mockups (`mockups/`)
`dashboard-*.png`, `lifecycle-*.png`, `crewboard-*.png` (desktop 1440 full page, mobile 390 @2x viewport) and `overview.png`. Source: `base.css`, `icons.py` (original inline SVG), `build.py` → `*.html`, `shot.py` renders. All data is sample data (Site 1–4, Worker A1, Crew B, initials avatars).

---
## Verification status (v2)
**Now verified (deep/):** signed-in desktop at 1920 for every top-level route, all 7 project tabs, mobile 390 for Dashboard, Crew Board, Forms & Docs, Safety, Lifecycle, and the project Forms and Crew tabs. Focus-ring behaviour, DOM semantics (from Atlas's accessibility-tree notes) and console errors are verified.
**Corrected from v1:** N1 (Projects list exists) and N2 (Hours = /reports by design).
**Still unverified:**
- Mobile for Search, Inbox, Timeline, Money, Hours, Users, Clients, Projects, Compliance, and the Photos/Docs/Punch/Daily-log tabs
- The full keyboard tab order (only partly tested)
- Screen-reader output beyond the a11y tree
- Exact computed colours inside the app: ratios use the palette read from the login page plus visual estimates
- Offline behaviour, which wasn't tested (no network throttling or offline run)
- Project detail for the other 3 projects, and the Users "Full profile" page
- Submit, upload and assign flows and their validation and error states, which were intentionally not exercised
- App source, which isn't on the box

**Mockups:** no material change needed. They already include a bottom tab bar, semantic, link-like large rows, honest status pills ("FLHA missing", "No crew · blocked") and per-site crew cards. The v2 findings reinforce them rather than changing them.
