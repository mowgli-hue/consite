# Consite loophole audit — September 5, 2026

Three-perspective audit: dishonest/careless worker, foreman, office (admin +
view-only manager), plus a full Firestore/Storage rules review. ~60 findings.
**FIXED** = in commit `security hardening` (this date). **OPEN** = documented,
needs a decision or a bigger build.

## Fixed in this pass (deploy rules + functions!)

| # | Severity | Loophole (the site story) | Fix |
|---|---|---|---|
| 1 | CRITICAL | Worker could rewrite his own clockInAt/breakMinutes after the fact — edit Friday's shift from 8.5h to 11h the night before payroll. Could also CREATE fully backdated, even born-'approved' shifts (self-create had zero field checks). | Attendance rules now field-validate both paths: self-create = open shift only, timestamps within a bounded window, no status/approval/break fields; self-update = closing your own open shift, nothing else. |
| 2 | CRITICAL | Anyone could self-add a fake "First Aid" cert (5 sec of typing, no document) → lifecycle Crew check turns green, ⛑ on Crew Board, site runs with no real OFA ticket. Regulatory liability. | Certs rules: self-added certs are forced `verified:false`; only admin verifies. Lifecycle + Crew Board ignore unverified certs (legacy certs w/o the field grandfathered). Verify button added on the admin worker-profile screen. |
| 3 | CRITICAL | Foreman could enter a manual shift AND approve it himself (rules allowed any 'approve' holder to write anything; UI check was only vs own uid). Ghost-payroll with one actor. | Rules: approve branch is status-fields-only, never your own shift, never a shift you entered, never re-approving. Clockout-others branch can only close an open shift. UI mirrors it. |
| 4 | CRITICAL | Lifecycle Advance button was ENABLED while checks were still loading (`[].every()===true`) — fast tap advanced any stage past open deficiencies. Punch check also FAILED OPEN (read error → "No open deficiencies ✓"). | Gate requires loaded, non-empty, all-passing checks; advance re-verifies against live data at tap time; punch check fails closed with a retry instruction. |
| 5 | CRITICAL | Auto-closed shifts (missed clock-out sweep) never got `status:'pending'` → never appeared in any approval queue → worker's day unpayable, invisibly. | Sweep now sets `status:'pending'`. |
| 6 | CRITICAL | Offline queue jammed forever if a clock-in synced in an earlier flush than its clock-out (`unresolved-local-ref` → break). Every later FLHA/update silently stopped syncing. | Local→real id resolution is persisted into the queue; permanent errors (permission-denied etc.) park the op instead of blocking everything behind it. |
| 7 | HIGH | Signed contract PDF was stored under `media/` — every crew member could read it (see the job's price) and even overwrite it. | New uploads go to `projects/{pid}/contract/` — office-read, admin-write. **Old contracts stay member-readable until re-attached — re-upload each active contract once.** |
| 8 | HIGH | Foremen could edit ANY field on phases — incl. `invoiceMilestone` and `invoicedAt` (money). Phases deletable after invoicing (erases billing record). | Foreman phase updates limited to status/completedAt/completedBy; invoice fields admin-only; invoiced phases undeletable. |
| 9 | HIGH | Unbilled 💰 milestones vanished from Money view when a job was deactivated/archived — literal lost revenue. | Money view reads all projects; closed-but-unbilled milestones flagged "⚠ JOB CLOSED — STILL UNBILLED". |
| 10 | HIGH | Manual (typed) hours were indistinguishable from GPS hours in the office report and payroll CSV. | ✎ MANUAL tag in Hours & Reports + CSV columns: Entry type / Entered by / Approved by. |
| 11 | HIGH | Workers/managers could rewrite notification BODIES ("your ticket expires" → "cert verified"). | Notification updates limited to read/readAt. |
| 12 | MEDIUM | FLHA submissions were fully editable for 24h (rewrite the hazard answers after an incident); submittedAt was client-controlled (future-date = permanent edit window). | Create pins submittedAt to a bounded window; updates restricted to values/endOfDay fields; approval/PDF fields immutable. |
| 13 | MEDIUM | Daily Briefing said "Site FLHA is done ✓" if ANY submission existed today (a receipt counted). | Filters to FLHA schema ids. |

## Open — decide / next build (priority order)

1. **Deactivation doesn't kill sessions.** `active:false` is only checked at
   sign-in; no rule reads it. A fired foreman with the app open keeps working
   indefinitely. Needs: revoke refresh tokens in a Cloud Function on
   deactivate + `active` check in rules/AuthContext. (HIGH)
2. **Offline clock-in can duplicate** (timeout race: original write commits
   AND queued copy replays). Needs an idempotency key checked on flush. (HIGH)
3. **FLHA is a dismissible popup, not a gate.** Tap Cancel → on the clock all
   day with no hazard assessment. Should navigate into the form + show a red
   "FLHA not done" strip on the active shift. Same for End-of-Day. (HIGH —
   it's the compliance premise)
4. **Multi-project workers are pinned to project #1** for Scan / Work Update /
   Report Issue / Forms / Drawings / Briefing — a hazard photo on Site B files
   to Site A. Needs a selected-project context seeded from the open shift. (HIGH)
5. **Report Issue & Scan Receipt never upload the photo** — they store a
   device-local file:// URI. Evidence dies with the phone cache. (HIGH)
6. **Cross-project double clock-in** — `findOpenShift` only checks the target
   project server-side; UI check is best-effort. (HIGH)
7. **Removing/deactivating a worker mid-shift orphans the open shift** (can't
   clock out; feeds the 37h auto-close). Block removal while clocked in, or
   force clock-out. (HIGH)
8. **Re-assigning silently demotes a foreman** — `addMembership` setDoc
   overwrites role:'worker' without merge. Crew Board toggle off/on wipes the
   approver. (HIGH)
9. **No last-admin guard** — two admins can demote each other; recovery only
   via Firebase console. Needs a server-side count. (HIGH)
10. **Timesheet (My Hours) shows gross, statusless numbers** — no
    pending/approved split, ignores breakMinutes, open shifts excluded from
    total. The paycheque-argument screen. (HIGH)
11. **i18n**: My Hours, Crew Hours, My Tasks, Drawings, Punch List, Forms,
    Work Update, form-fill (the FLHA itself!) and ~40 error paths are
    English-only; voice input is hardcoded en-US (Punjabi speech → garbage →
    fed to AI). (MEDIUM, big for Brown Bros crews)
12. **Safety Center FLHA% counts one submission as the whole site's day** —
    per-worker-day coverage is the honest number. Daily log doc-per-date is
    overwritable by any member. Manual shifts create worked-days that tank
    FLHA%. (MEDIUM)
13. **Dashboard read cost** — portfolio/crew/safety do O(projects×workers)
    sequential reads + an unbounded certifications collection-group scan on
    every refresh. Denormalize `hasFirstAid` onto member docs via trigger. (MEDIUM)
14. **Money**: double-invoice race (transaction needed), Undo leaves no trail,
    "Contracts in play" sums whole contract values. GPS accuracy is added to
    the geofence radius unbounded (2km fence on a bad phone). Reports date
    range is a rolling window, not calendar days. `geofenceEnabled:false`
    records no GPS at all. Manager sees create/edit buttons on Projects screen
    that just throw. Photo size guard lies about auto-compress. (assorted MEDIUM/LOW)

## Deploy checklist for this pass

```bash
cd ~/Downloads/consite && git push origin main          # app → Railway
firebase deploy --only functions,firestore:rules,storage  # rules + sweep fix
node seed-daily-progress.mjs                             # if not yet run
```
Then: re-upload the signed contract on each active project (moves it to the
office-only path), and spot-check that clock-in/out and foreman approval still
work end-to-end (the rules got much stricter — anything unexpected will now
show as permission-denied instead of silently succeeding).
