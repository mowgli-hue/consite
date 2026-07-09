// Seeds the Brown Bros FLHA (MHSA Field Level Hazard Assessment) form schema
// and points every active project's daily FLHA at it.
//
// Run with:  node seed-flha-brownbros.mjs
// (uses Application Default Credentials — run `gcloud auth application-default login` if needed)

import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'consite-prod' });
const db = admin.firestore();

const PHYSICAL_HAZARDS = [
  'Housekeeping', 'Material storage & handling', 'Slip/Trip/Fall potential',
  'Blocked exits & walkways', 'Confined/restricted space', 'Improper ventilation',
  'Powerlines overhead/underground', 'Ground/surface condition', 'Open excavation',
  'Lighting', 'Weather', 'Hot work', 'Vehicle/pedestrian traffic', 'Working at heights',
  'Scaffolding', 'Falling objects', 'Loads moving or being hoisted', 'Ladder use',
  'Critical lift', 'Others working below/overhead', 'Incorrect tools/equipment',
  'Working on/near energized equipment', 'Defective tools/equipment',
  'Unguarded equipment', 'Noise', 'Vibration',
];

const ERGONOMIC_HAZARDS = [
  'Awkward body positioning', 'Overextension', 'Repetitive motion',
  'Twisting/reaching/bending', 'Cramped/tight work area', 'Forceful pushing/pulling',
  'Awkward grip/load carried', 'Working at overhead height',
];

const CHEMICAL_HAZARDS = [
  'Freeze burn', 'Chemical handling/storage', 'Spill potential',
  'Dust/fumes/vapours/gases', 'Fire/explosion/reactive properties',
  'Acid/corrosive material', 'Aerosols',
];

const BIOLOGICAL_HAZARDS = [
  'Waste disposal', 'Blood/bodily fluid', 'Virus/bacteria', 'Insect bite',
  'Lack of hygiene/sanitation',
];

const PSYCHOSOCIAL_HAZARDS = [
  'Personal limitations/illness/age/mental stability', 'Harassment/violence',
  'Stress/fatigue', 'Working alone', 'Worker(s) not competent',
];

const RISK_OPTIONS = [
  '1 — Low (minor × unlikely)', '2 — Low', '3 — Medium', '4 — Medium',
  '6 — High', '9 — Critical (catastrophic × highly likely)',
];

const YES_NO = ['Yes', 'No'];

function hazardRow(n) {
  return [
    { id: `hazard-${n}`, type: 'text', label: `Hazard ${n}`, placeholder: 'e.g. working at heights on 2nd floor joists' },
    { id: `controls-${n}`, type: 'text', label: `Controls for hazard ${n}`, placeholder: 'e.g. guardrails installed, harness + tie-off' },
    { id: `risk-${n}`, type: 'dropdown', label: `Risk rating ${n} (severity × likelihood)`, options: RISK_OPTIONS },
  ];
}

function crewSignoff(n) {
  return [
    { id: `crew-name-${n}`, type: 'text', label: `Crew member ${n} — name` },
    { id: `crew-sig-${n}`, type: 'signature', label: `Crew member ${n} — signature` },
  ];
}

const SCHEMA = {
  id: 'flha-brownbros-v1',
  title: 'FLHA — Field Level Hazard Assessment (Brown Bros)',
  description:
    'One per site per day, completed by the foreman before work begins. ' +
    'All affected worksite parties must sign off before work can begin.',
  category: 'flha',
  version: 1,
  archived: false,
  createdBy: 'SEED:mhsa-template',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  sections: [
    {
      id: 'site',
      title: 'Site & Task',
      fields: [
        { id: 'company', type: 'text', label: 'Company name', placeholder: 'Brown Bros Framing and Drywall' },
        { id: 'date', type: 'date', mode: 'date', label: 'Date', required: true },
        { id: 'rep', type: 'text', label: 'Worksite representative — name / phone #' },
        { id: 'task', type: 'multiline', label: 'Describe the task(s) being performed', rows: 3, required: true,
          helperText: 'See it — what could go wrong? Evaluate it — how bad could it be? Control it — what can I do to fix it?' },
      ],
    },
    {
      id: 'hazards-physical',
      title: 'Hazards — Physical',
      description: 'Check all that apply.',
      fields: [
        { id: 'hz-physical', type: 'checkbox', label: 'Physical hazards', options: PHYSICAL_HAZARDS },
        { id: 'hz-physical-other', type: 'text', label: 'Other physical hazard' },
      ],
    },
    {
      id: 'hazards-ergo',
      title: 'Hazards — Ergonomic',
      fields: [
        { id: 'hz-ergo', type: 'checkbox', label: 'Ergonomic hazards', options: ERGONOMIC_HAZARDS },
        { id: 'hz-ergo-other', type: 'text', label: 'Other ergonomic hazard' },
      ],
    },
    {
      id: 'hazards-chem',
      title: 'Hazards — Chemical',
      fields: [
        { id: 'hz-chem', type: 'checkbox', label: 'Chemical hazards', options: CHEMICAL_HAZARDS },
        { id: 'hz-chem-other', type: 'text', label: 'Other chemical hazard' },
      ],
    },
    {
      id: 'hazards-bio-psy',
      title: 'Hazards — Biological & Psychosocial',
      fields: [
        { id: 'hz-bio', type: 'checkbox', label: 'Biological hazards', options: BIOLOGICAL_HAZARDS },
        { id: 'hz-psy', type: 'checkbox', label: 'Psychosocial hazards', options: PSYCHOSOCIAL_HAZARDS },
      ],
    },
    {
      id: 'control-plan',
      title: 'Hazard Control Plan',
      description: 'Identify the hazards and outline plans to eliminate or control each. Then assign a risk rating (Risk = Severity × Likelihood, each 1–3).',
      fields: [...hazardRow(1), ...hazardRow(2), ...hazardRow(3), ...hazardRow(4)],
    },
    {
      id: 'checks',
      title: 'Safety Checks & PPE',
      fields: [
        { id: 'lockout', type: 'dropdown', label: 'Did you properly lock out & tag any defective tools/equipment?', options: [...YES_NO, 'N/A — none defective'], required: true },
        { id: 'notified', type: 'dropdown', label: 'Did you notify nearby workers of any hazards that may affect them?', options: [...YES_NO, 'N/A — no nearby workers'], required: true },
        { id: 'ppe', type: 'text', label: 'List PPE required', required: true },
        { id: 'ppe-inspected', type: 'checkbox', label: 'PPE inspected?' },
        { id: 'first-aid', type: 'text', label: 'Location of first aid supplies', required: true },
        { id: 'muster', type: 'text', label: 'Emergency muster location', required: true },
        { id: 'alone', type: 'multiline', label: 'If working alone, explain check-in procedure', rows: 2 },
      ],
    },
    {
      id: 'signoff',
      title: 'Sign-off — all affected worksite parties must sign before work begins',
      description: 'Crew signs on the foreman’s phone after the toolbox talk. If leaving and returning to a task, workers must re-acknowledge that no new hazards are present.',
      fields: [
        ...crewSignoff(1), ...crewSignoff(2), ...crewSignoff(3), ...crewSignoff(4),
        { id: 'foreman-sig', type: 'signature', label: 'Foreman / supervisor signature', required: true },
        { id: 'rep-sig', type: 'signature', label: 'Worksite representative signature' },
      ],
    },
    {
      id: 'end-of-day',
      title: 'End of Day',
      description: 'Complete before leaving site.',
      fields: [
        { id: 'cleanup', type: 'dropdown', label: 'Was the work area cleaned up / materials stored and disposed of properly?', options: YES_NO },
        { id: 'incidents', type: 'dropdown', label: 'Did any incidents occur?', options: YES_NO },
        { id: 'incident-explain', type: 'multiline', label: 'If yes, explain', rows: 3 },
        { id: 'rep-comments', type: 'multiline', label: 'Worksite representative comments', rows: 2 },
      ],
    },
  ],
};

async function main() {
  console.log('Seeding forms/flha-brownbros-v1 …');
  await db.doc('forms/flha-brownbros-v1').set(SCHEMA);

  console.log('Pointing active projects at the new FLHA …');
  const projects = await db.collection('projects').where('active', '==', true).get();
  for (const p of projects.docs) {
    await p.ref.update({ defaultFlhaFormId: 'flha-brownbros-v1' });
    console.log(`  ✓ ${p.data().name}`);
  }

  console.log('Done. Foremen now get the Brown Bros FLHA at clock-in.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
