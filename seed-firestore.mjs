// One-shot seed script using Firebase CLI auth (no JSON key needed).
// Run with: node seed-firestore.mjs <your-admin-uid>

import admin from 'firebase-admin';

const ADMIN_UID = process.argv[2];
if (!ADMIN_UID) {
  console.error('Usage: node seed-firestore.mjs <your-admin-uid>');
  process.exit(1);
}

admin.initializeApp({
  projectId: 'consite-prod',
});
const db = admin.firestore();

const PROJECT_ID = 'sample-project-1';

async function main() {
  console.log('Seeding project…');
  await db.doc(`projects/${PROJECT_ID}`).set({
    name: 'Fleetwood Tower – Phase 1',
    address: '16007 80 Ave, Surrey, BC',
    projectType: 'residential framing',
    geofence: { center: { lat: 49.1539, lng: -122.7972 }, radiusM: 150 },
    geofenceEnabled: false,
    active: true,
    memberUids: [ADMIN_UID],
    supervisorUids: [],
    createdAt: Date.now(),
    createdBy: 'SEED',
  });

  console.log('Seeding member doc…');
  await db.doc(`projects/${PROJECT_ID}/members/${ADMIN_UID}`).set({
    uid: ADMIN_UID,
    role: 'worker',
    permissions: ['worker.projects.view','worker.forms.submit','worker.forms.download','worker.plans.view','worker.templates.view','worker.media.upload'],
    assignedAt: Date.now(),
    assignedBy: 'SEED',
  });

  console.log('Seeding FLHA form…');
  await db.doc('forms/flha-daily-v1').set({
    id: 'flha-daily-v1',
    title: 'Daily FLHA — Field Level Hazard Assessment',
    description: 'Complete before starting work each day.',
    category: 'flha',
    version: 1,
    archived: false,
    createdBy: 'SEED',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sections: [
      { id: 'context', title: 'Job context', fields: [
        { id: 'job-description', type: 'text', label: "What work are you doing today?", placeholder: 'e.g. Framing 2nd floor walls', required: true },
        { id: 'start-time', type: 'date', label: 'Start time', mode: 'datetime', required: true },
        { id: 'crew-size', type: 'dropdown', label: 'Crew size', options: ['Just me','2–3','4–6','7–10','10+'], required: true },
      ]},
      { id: 'hazards', title: 'Hazards on site', description: 'Check all that apply', fields: [
        { id: 'hazards-present', type: 'checkbox', label: 'Hazards present today', options: ['Working at heights','Struck-by hazards','Caught-in / caught-between','Electrical hazards','Excavation / trench','Confined space','Hot work (welding/cutting)','Chemical exposure','Heavy lifting / manual handling','Slip / trip / fall (same level)','Mobile equipment','Noise exposure','Dust / silica exposure','Adverse weather','Heat stress'] },
        { id: 'mitigation', type: 'multiline', label: 'How will you control these hazards?', placeholder: 'PPE, barriers, lockouts, etc.', rows: 4, required: true },
      ]},
      { id: 'ppe', title: 'PPE check', fields: [
        { id: 'ppe-confirmed', type: 'checkbox', label: 'Required PPE confirmed on hand', options: ['Hard hat','Safety glasses','Steel-toe boots','Hi-vis vest','Cut-resistant gloves','Impact gloves','Hearing protection','Respirator / dust mask','Fall arrest harness'] },
      ]},
      { id: 'photos', title: 'Site photos', fields: [
        { id: 'site-photos', type: 'image', label: 'Photos of work area (optional)', max: 4 },
      ]},
      { id: 'signoff', title: 'Sign-off', fields: [
        { id: 'worker-signature', type: 'signature', label: 'Worker signature', required: true },
      ]},
    ],
  });

  console.log('Seeding worker dashboard modules…');
  const modules = [
    { id: 'projects', label: 'Projects', icon: 'briefcase', route: '/projects', order: 1, visible: true, requiredPermissions: ['worker.projects.view'], subtitle: 'View your assigned sites' },
    { id: 'clock', label: 'Clock In / Out', icon: 'clock', route: '/clock', order: 2, visible: true, requiredPermissions: [], subtitle: 'GPS-verified attendance' },
    { id: 'flha', label: 'FLHA Forms', icon: 'shield', route: '/forms/flha-daily-v1?projectId=sample-project-1', order: 3, visible: true, requiredPermissions: ['worker.forms.submit'], subtitle: 'Daily safety checks' },
    { id: 'templates', label: 'Templates', icon: 'file-text', route: '/templates', order: 4, visible: true, requiredPermissions: ['worker.templates.view'], subtitle: 'Safety docs & policies' },
  ];
  for (const m of modules) await db.doc(`dashboards/worker/modules/${m.id}`).set(m);

  console.log('Updating admin user projectIds…');
  await db.doc(`users/${ADMIN_UID}`).update({ projectIds: [PROJECT_ID] });

  console.log('\n✅ Seed complete!');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
