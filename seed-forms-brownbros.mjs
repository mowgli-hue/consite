// Seeds the Quality Check and Environmental Checklist form schemas.
// Run with:  node seed-forms-brownbros.mjs
// (uses ADC — `gcloud auth application-default login` if it complains)

import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'consite-prod' });
const db = admin.firestore();

const YES_NO_NA = ['Yes', 'No', 'N/A'];

const QC_SCHEMA = {
  id: 'qc-framing-drywall-v1',
  title: 'Quality Check — Framing & Drywall',
  description: 'Foreman completes per area before hand-off to the next trade or GC walkthrough.',
  category: 'inspection',
  version: 1,
  archived: false,
  createdBy: 'SEED:brownbros',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  sections: [
    {
      id: 'area',
      title: 'Area',
      fields: [
        { id: 'location', type: 'text', label: 'Area / unit / floor being checked', required: true, placeholder: 'e.g. Building B, Unit 204' },
        { id: 'stage', type: 'dropdown', label: 'Stage', required: true, options: ['Framing — walls', 'Framing — floors/joists', 'Framing — roof', 'Sheathing', 'Drywall — hung', 'Drywall — taped', 'Drywall — finished/sanded'] },
        { id: 'photos', type: 'image', label: 'Photos of the work', max: 4 },
      ],
    },
    {
      id: 'framing-checks',
      title: 'Framing Checks',
      fields: [
        { id: 'fr-plumb', type: 'dropdown', label: 'Walls plumb and straight (within tolerance)', options: YES_NO_NA },
        { id: 'fr-layout', type: 'dropdown', label: 'Layout matches drawings (openings, dimensions)', options: YES_NO_NA },
        { id: 'fr-blocking', type: 'dropdown', label: 'Blocking/backing installed (cabinets, fixtures, rails)', options: YES_NO_NA },
        { id: 'fr-fasteners', type: 'dropdown', label: 'Fastening per schedule (nailing pattern, hangers)', options: YES_NO_NA },
        { id: 'fr-headers', type: 'dropdown', label: 'Headers/beams sized and bearing correctly', options: YES_NO_NA },
      ],
    },
    {
      id: 'drywall-checks',
      title: 'Drywall Checks',
      fields: [
        { id: 'dw-screws', type: 'dropdown', label: 'Screw pattern/depth correct, no breaks in paper', options: YES_NO_NA },
        { id: 'dw-joints', type: 'dropdown', label: 'Joints tight, staggered, no broken corners', options: YES_NO_NA },
        { id: 'dw-finish', type: 'dropdown', label: 'Tape/mud finish level appropriate, no visible defects', options: YES_NO_NA },
        { id: 'dw-protect', type: 'dropdown', label: 'Fire/sound assemblies per spec (type X, insulation, caulking)', options: YES_NO_NA },
      ],
    },
    {
      id: 'result',
      title: 'Result',
      fields: [
        { id: 'deficiencies-found', type: 'multiline', label: 'Deficiencies found (also report via Punch List)', rows: 3 },
        { id: 'verdict', type: 'dropdown', label: 'Verdict', required: true, options: ['Pass — ready for next trade', 'Pass with noted items', 'Fail — rework required'] },
        { id: 'qc-sig', type: 'signature', label: 'Checked by (signature)', required: true },
      ],
    },
  ],
};

const ENV_SCHEMA = {
  id: 'env-checklist-v1',
  title: 'Environmental Checklist',
  description: 'Weekly site environmental check — waste, dust, spills, runoff.',
  category: 'inspection',
  version: 1,
  archived: false,
  createdBy: 'SEED:brownbros',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  sections: [
    {
      id: 'env-checks',
      title: 'Site Environmental Checks',
      fields: [
        { id: 'waste-bins', type: 'dropdown', label: 'Waste bins available and not overflowing; sorted where required', options: YES_NO_NA, required: true },
        { id: 'dust', type: 'dropdown', label: 'Dust control adequate (cutting stations, sweeping compound)', options: YES_NO_NA, required: true },
        { id: 'spills', type: 'dropdown', label: 'No fuel/chemical spills; spill kit stocked and accessible', options: YES_NO_NA, required: true },
        { id: 'runoff', type: 'dropdown', label: 'Silt/erosion control intact; no sediment leaving site', options: YES_NO_NA },
        { id: 'noise', type: 'dropdown', label: 'Noise within municipal bylaw hours', options: YES_NO_NA },
        { id: 'burning', type: 'dropdown', label: 'No unauthorized burning of materials', options: YES_NO_NA },
      ],
    },
    {
      id: 'env-notes',
      title: 'Notes & Sign-off',
      fields: [
        { id: 'env-issues', type: 'multiline', label: 'Issues found and corrective action taken', rows: 3 },
        { id: 'env-photos', type: 'image', label: 'Photos (if issues)', max: 3 },
        { id: 'env-sig', type: 'signature', label: 'Completed by (signature)', required: true },
      ],
    },
  ],
};


const TOOLBOX_SCHEMA = {
  id: 'toolbox-talk-v1',
  title: 'Toolbox Talk',
  description: 'Quick crew safety talk — AI drafts the key points from the topic; crew signs on the foreman\u2019s phone. Auto-recorded and emailed like every form.',
  category: 'toolbox',
  version: 1,
  archived: false,
  createdBy: 'SEED:brownbros',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  sections: [
    {
      id: 'talk',
      title: 'The Talk',
      fields: [
        { id: 'topic', type: 'dropdown', label: 'Topic', required: true, allowOther: true,
          options: ['Working at heights / fall protection', 'Ladder safety', 'Housekeeping & trip hazards', 'Power tool safety', 'Nail gun safety', 'Scaffolding', 'Material handling & lifting', 'Heat stress / cold stress', 'Silica dust & respiratory', 'Electrical awareness', 'Emergency procedures & muster', 'WHMIS refresher'] },
        { id: 'key-points', type: 'multiline', label: 'Key points covered', rows: 4, required: true,
          helperText: 'Tap the mic \u2014 say the topic and AI drafts the points; edit as needed.' },
        { id: 'site-specific', type: 'multiline', label: 'Site-specific hazards discussed today', rows: 2 },
      ],
    },
    {
      id: 'signoff',
      title: 'Crew Sign-off',
      fields: [
        { id: 'crew-name-1', type: 'text', label: 'Crew member 1 \u2014 name' },
        { id: 'crew-sig-1', type: 'signature', label: 'Crew member 1 \u2014 signature' },
        { id: 'crew-name-2', type: 'text', label: 'Crew member 2 \u2014 name' },
        { id: 'crew-sig-2', type: 'signature', label: 'Crew member 2 \u2014 signature' },
        { id: 'crew-name-3', type: 'text', label: 'Crew member 3 \u2014 name' },
        { id: 'crew-sig-3', type: 'signature', label: 'Crew member 3 \u2014 signature' },
        { id: 'crew-name-4', type: 'text', label: 'Crew member 4 \u2014 name' },
        { id: 'crew-sig-4', type: 'signature', label: 'Crew member 4 \u2014 signature' },
        { id: 'foreman-sig', type: 'signature', label: 'Foreman signature', required: true },
      ],
    },
  ],
};

async function main() {
  for (const schema of [QC_SCHEMA, ENV_SCHEMA, TOOLBOX_SCHEMA]) {
    console.log(`Seeding forms/${schema.id} …`);
    await db.doc(`forms/${schema.id}`).set(schema);
  }
  console.log('Done — QC and Environmental forms are live in the Forms browser.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
