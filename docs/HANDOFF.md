# Consite — Session Handoff

**Read this first in a fresh session.** It is the complete state of the project as of
July 9, 2026 (end of the v0.5 build session, 32 shipped tasks).

## What Consite is

The AI operating system for field construction (see `docs/VISION-V3.md`). Built by
Jungle Labs Inc. as IP, delivered as a service to first customer **Brown Bros Framing
and Drywall** (Navneet Singh, $5k retainer, cost-plus monthly). Rule for every
feature: *does it save a foreman an hour a day?* Automation everywhere: the app
computes, people confirm.

## Stack & infrastructure

- **App**: Expo SDK 54 / React 19 / RN 0.81, expo-router, TypeScript. One codebase →
  phones (Expo Go for now) + web.
- **Backend**: Firebase project `consite-prod` — Auth, Firestore (us-west1),
  Storage, ~20 Cloud Functions (us-central1 + us-west1). Anthropic key in Secret
  Manager. Firestore/Storage rules in repo.
- **Web hosting**: GitHub `mowgli-hue/consite` (private) → Railway auto-deploys main
  → https://consite-production.up.railway.app. Push to main = deploy (~3 min).
  Node pinned via `.nvmrc`; `.npmrc` has legacy-peer-deps.
- **Records email**: Resend (test mode — delivers only to mowgli@junglelabsworld.com
  until a domain is verified). Secrets: RESEND_API_KEY, RECORDS_EMAIL.
- **WhatsApp**: Meta Cloud API channel built, ships disabled. Secrets
  WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID (set to "disabled" until Meta
  setup; template name `consite_update`, one body var).
- **Owner's Mac** runs deploys: `firebase deploy --only functions,firestore:rules,storage`
  and seed scripts with `node <script>.mjs` (ADC via gcloud). GCP org policies were
  loosened for this project only (allUsers invoker + policy override at project).

## What's built and working (verified live)

Worker (phone-first, Punjabi toggle in Profile): GPS clock in/out with offline queue
→ FLHA at clock-in (real MHSA form, AI-filled, crew signs) → End-of-Day questions at
clock-out (merges into morning submission, re-emails PDF) → AI Scan (photo →
progress/materials/safety, auto-filed) → Work Update (photo+voice → timeline) → My
Tasks (pin-tasks from drawings) → My Hours → My Profile (WCB, emergency contact,
tickets, safety docs).

Foreman extras: Crew Hours approval (no self-approve), drawings upload + pin tasks
(assign → complete w/ photo → accept), Daily Briefing (role-adaptive intelligence).

Office (desktop, sidebar nav, safety-orange brand): Dashboard w/ live stats · Search +
ask-AI over project history · Inbox (auto alerts: deficiencies, missed clock-outs,
phase completions w/ 💰 invoice-milestone flags) · Site Timeline · Hours & Reports
(approve ✓ per row, payroll CSV w/ approval status, one-tap Audit Pack PDF) · Users
(create accounts, role chips Worker/Foreman/Lead, Manager view-only role) · Clients
CRM (append-only comm log) · Projects → **Lifecycle screen** (v0.5: 6 stages, checks
verified from live data w/ instructions, phase templates, gated advance) · Forms &
Documents library (archive forms, upload PDFs) · Compliance.

Records pipeline: every form submission → PDF (real MHSA template for FLHA, generic
for others, signatures embedded) → Storage + emailed. Audit pack merges everything.

## Pending on the OWNER's side (check before building more)

1. `node seed-forms-brownbros.mjs` (QC, Environmental, Toolbox Talk forms)
2. `node seed-brownbros-pack.mjs` (Orientation/Tools/Scaffolding/Harness/RFI forms +
   OH&S manual/policy docs — needs `git pull` first, seed-assets/ in repo)
3. Full deploy: `firebase deploy --only functions,firestore:rules,storage`
   (WhatsApp secrets: enter "disabled" if prompted)
4. Buy consite.app (NOT via Wix DNS) → Resend domain verify → Railway custom domain
5. Meta WhatsApp Business setup (steps were messaged; channel activates via secrets)
6. GitHub push token in this repo's history is user-owned; suggest rotation.

## NEXT BUILD (agreed): Office System — spec Part 2 in V0.5-LIFECYCLE-SPEC.md

Owner's explicit ask: **"proper dashboard where all these steps come up — this is
done, this is done."** Start with:

1. **Portfolio/steps dashboard** — replace/extend admin dashboard: one card per
   project showing stage stepper mini-view, ✓/✗ counts of current-stage checks, the
   single blocking item, contract value, phase progress bar. The at-a-glance "what's
   done, what's next" across all jobs. (computeStageChecks in src/lib/lifecycle.ts
   already returns everything needed — render it.)
2. **Money view** — invoice queue: phases with invoiceMilestone=true and status=done
   but not marked invoiced (add `invoicedAt` field + button) + link to payroll export.
3. **Crew Board** — workers × projects grid, reassign, live first-aid/conflict checks.
4. **Safety Center** — FLHA/toolbox compliance % per site, safety deficiencies, certs.
5. Bids (estimator pre-stage) later.

## Conventions a fresh session must keep

- Verify in sandbox before pushing: copy repo to /tmp, `npm ci`, `npx tsc --noEmit`,
  `npx expo export --platform web` (bash calls have 45s cap; background procs die
  between calls; /tmp may reset — npm cache persists).
- All colors/typography from `src/theme` (single-token rebrand).
- `notify`/`confirm` from src/lib/notify — never Alert.alert (web no-op).
- New collections need firestore.rules entries; reads use isStaff() for manager.
- Every feature writes structured, timestamped, GPS-tagged per-project data — that
  data model IS the moat (Layers 2–5 of the vision are queries over it).
- Trade-specific stuff (phases, forms, certs) is DATA/templates, never code.
- Seeds are .mjs scripts the owner runs on the Mac with ADC.
- Owner communicates informally; confirm intent when ambiguous, then ship.

## Key docs

`docs/VISION-V3.md` (north star) · `docs/V0.5-LIFECYCLE-SPEC.md` (spine + Part 2
office system) · `docs/V0.4-BROWNBROS-SPEC.md` (how Brown Bros operates) ·
`CONSITE-STRESS-TEST-PLAN.md` in owner's chat outputs · pricing/outreach docs from v0.2.
