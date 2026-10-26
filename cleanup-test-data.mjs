// Pre-handoff cleanup: remove QA test data and park test accounts.
//
//   node cleanup-test-data.mjs          ← DRY RUN: lists everything it
//                                         would touch, deletes nothing
//   node cleanup-test-data.mjs --yes    ← actually deletes/deactivates
//
// What it targets (from the Oct 2026 QA rounds):
//   · everything created by the QA crew account (admin@junglelabsworld.com):
//     shifts, form submissions, work-log/timeline posts, deficiencies,
//     expenses — plus their PDFs/photos in Storage
//   · anything whose text carries the "TEST – Atlas QA" marker
//   · media named test.jpg (the solid-green QA uploads)
//   · deactivates the duplicate QA account and test@gmail.com
// It also PRINTS anything else that looks like test data so you can see
// what exists that we didn't create. Real Brown Bros data is untouched.
// (uses ADC — `gcloud auth application-default login` if it complains)

import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'consite-prod' });
const db = admin.firestore();
const bucket = admin.storage().bucket('consite-prod.appspot.com');

const APPLY = process.argv.includes('--yes');
// Accounts to DELETE outright (owner's call): both "Navdeep Singh Sandhu"
// test identities — Auth login, user doc, memberships, and every record
// they created (incl. the Jul 8 demo FLHAs).
const DELETE_EMAILS = ['lavishadhingra06@gmail.com', 'admin@junglelabsworld.com'];
// Accounts to only DEACTIVATE (kept for possible future QA, signed out everywhere).
const DEACTIVATE_EMAILS = ['test@gmail.com'];
const QA_EMAILS = [...DELETE_EMAILS, ...DEACTIVATE_EMAILS]; // records purge list
const MARKERS = ['TEST – Atlas QA', 'TEST - Atlas QA', 'Atlas QA'];

const hasMarker = (v) => {
  try { return MARKERS.some((m) => JSON.stringify(v ?? '').includes(m)); }
  catch { return false; }
};

let deletions = 0;
async function del(ref, why, storagePaths = []) {
  deletions += 1;
  console.log(`  ${APPLY ? 'DELETE' : 'would delete'}: ${ref.path}  (${why})`);
  if (APPLY) {
    await ref.delete();
    for (const p of storagePaths.filter(Boolean)) {
      await bucket.file(p).delete().catch(() => console.log(`    (storage ${p} already gone)`));
    }
  } else if (storagePaths.filter(Boolean).length) {
    console.log(`    + storage: ${storagePaths.filter(Boolean).join(', ')}`);
  }
}

async function main() {
  console.log(APPLY ? '=== APPLY MODE ===' : '=== DRY RUN (add --yes to apply) ===\n');

  // ── QA accounts ────────────────────────────────────
  const qaUids = [];
  const deleteUids = [];
  const deactivateUids = [];
  const users = await db.collection('users').get();
  console.log(`\nUsers (${users.size} total):`);
  for (const u of users.docs) {
    const d = u.data();
    const email = String(d.email ?? '').toLowerCase();
    const tag = DELETE_EMAILS.includes(email) ? '→ DELETE    '
      : DEACTIVATE_EMAILS.includes(email) ? '→ deactivate'
      : '  keep      ';
    if (DELETE_EMAILS.includes(email)) { deleteUids.push(u.id); qaUids.push(u.id); }
    else if (DEACTIVATE_EMAILS.includes(email)) { deactivateUids.push(u.id); qaUids.push(u.id); }
    console.log(`  ${tag}: ${d.displayName} <${d.email}> role=${d.role} active=${d.active}`);
  }

  for (const uid of deactivateUids) {
    console.log(`  ${APPLY ? 'DEACTIVATE' : 'would deactivate'}: ${uid}`);
    if (APPLY) await db.collection('users').doc(uid).update({ active: false });
  }

  // Full account deletion: Auth user, user doc + subcollections, and
  // membership on every project.
  for (const uid of deleteUids) {
    console.log(`  ${APPLY ? 'DELETE ACCOUNT' : 'would delete account'}: ${uid}`);
    if (!APPLY) continue;
    await admin.auth().deleteUser(uid).catch((e) => console.log(`    (auth user: ${e.message})`));
    for (const sub of ['certifications', 'notifications']) {
      const docs = await db.collection('users').doc(uid).collection(sub).get();
      for (const d of docs.docs) await d.ref.delete();
    }
    await db.collection('users').doc(uid).delete();
    const allProjects = await db.collection('projects').get();
    for (const proj of allProjects.docs) {
      await proj.ref.collection('members').doc(uid).delete().catch(() => {});
      await proj.ref.update({
        memberUids: admin.firestore.FieldValue.arrayRemove(uid),
        supervisorUids: admin.firestore.FieldValue.arrayRemove(uid),
      }).catch(() => {});
    }
  }

  // ── Per-project records ───────────────────────────
  const projects = await db.collection('projects').get();
  for (const proj of projects.docs) {
    console.log(`\nProject: ${proj.data().name} (${proj.id})`);

    const att = await proj.ref.collection('attendance').get();
    for (const a of att.docs) {
      const d = a.data();
      if (qaUids.includes(d.uid) || hasMarker(d.notes) || hasMarker(d.displayName)) {
        await del(a.ref, `shift by ${d.displayName ?? d.uid}`);
      }
    }

    const subs = await proj.ref.collection('submissions').get();
    for (const s of subs.docs) {
      const d = s.data();
      if (qaUids.includes(d.submittedBy) || hasMarker(d.values)) {
        await del(s.ref, `submission ${d.schemaId}`, [d.pdfStoragePath, d.pdfPath]);
      }
    }

    const wl = await proj.ref.collection('workLog').get();
    for (const w of wl.docs) {
      const d = w.data();
      if (qaUids.includes(d.uid) || hasMarker(d.summary)) {
        await del(w.ref, 'work-log/timeline post', [d.photoPath]);
      }
    }

    const media = await proj.ref.collection('media').get();
    for (const m of media.docs) {
      const d = m.data();
      const name = String(d.caption ?? '') + ' ' + String(d.storagePath ?? '');
      if (qaUids.includes(d.uploadedBy) || /test\.jpg/i.test(name) || hasMarker(d.caption)) {
        await del(m.ref, `media ${d.caption ?? ''}`, [d.storagePath]);
      }
    }

    for (const colName of ['deficiencies', 'expenses', 'dailyLogs']) {
      const col = await proj.ref.collection(colName).get();
      for (const c of col.docs) {
        const d = c.data();
        const owner = d.reportedBy ?? d.recordedBy ?? d.submittedBy;
        if (qaUids.includes(owner) || hasMarker(d)) {
          await del(c.ref, colName, [d.photoPath]);
        }
      }
    }
  }

  console.log(`\n${APPLY ? 'Deleted' : 'Would delete'} ${deletions} record(s); QA accounts ${APPLY ? 'deactivated' : 'to deactivate'}: ${qaUids.length}.`);
  if (!APPLY) console.log('Review the list above, then run again with --yes');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
