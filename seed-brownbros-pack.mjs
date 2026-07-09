// Seeds the full Brown Bros paperwork pack:
//   - Orientation checklist, Tools / Scaffolding / Harness inspections, RFI (form schemas)
//   - Subcontractor Policy + OH&S Manual + Sign Sheet → Templates (workers' Safety Documents)
// Run with:  node seed-brownbros-pack.mjs
// (uses ADC — `gcloud auth application-default login` if it complains)

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';

admin.initializeApp({ projectId: 'consite-prod', storageBucket: 'consite-prod.firebasestorage.app' });
const db = admin.firestore();
const bucket = admin.storage().bucket();

const YNA = ['Yes', 'No', 'N/A'];
const PF = ['Pass', 'Fail'];
const yn = (id, label) => ({ id, type: 'dropdown', label, options: YNA });
const pf = (id, label) => ({ id, type: 'dropdown', label, options: PF });
const base = (id, title, description, category) => ({
  id, title, description, category, version: 1, archived: false,
  createdBy: 'SEED:brownbros-pack', createdAt: Date.now(), updatedAt: Date.now(),
});

// ── 1. Young & New Worker Orientation ──
const ORIENTATION_TOPICS = [
  'Supervisor name and contact information',
  'Rights & responsibilities: general duties of employers, workers, supervisors',
  'Right to refuse unsafe work, and the procedure for doing so',
  'Responsibility to report hazards, and the procedure for doing so',
  'Workplace health and safety rules',
  'Known hazards in the workplace and how to deal with them',
  'Safe work procedures for carrying out tasks',
  'Procedures for working alone or in isolation',
  'Violence in the workplace: risk reduction and procedures',
  'PPE — what to use, when to use it, where to find it',
  'First aid attendant name and contact information',
  'Locations of first aid kits and eye wash facilities',
  'How to report an illness, injury, or incident (including near misses)',
  'Emergency exits (muster points) and meeting points',
  'Locations of fire extinguishers and fire alarms',
  'How to use fire extinguishers',
  'What to do in an emergency',
  'Basic contents of the OHS program',
  'WHMIS: hazardous materials in the workplace',
  'WHMIS: hazard information on product labels',
  'WHMIS: location and significance of safety data sheets (SDSs)',
  'WHMIS: safe handling, use, storage, disposal',
  'WHMIS: emergency procedures including spill clean-up',
  'OHS committee / worker safety representative contact info',
  'Bullying and harassment: definition',
  'Bullying and harassment: how to report incidents',
  'Bullying and harassment: who follows up on complaints',
  'Reviewed and understood the Company OHS Manual prior to commencing work',
  'Reviewed tool, harness, and scaffolding inspection requirements and procedures',
];

const ORIENTATION = {
  ...base('orientation-bb-v1', 'Young & New Worker Orientation (Brown Bros)',
    'Complete on a worker’s first day, before any work begins. Both trainer and worker sign.', 'custom'),
  sections: [
    {
      id: 'who',
      title: 'Worker & Orientation Details',
      fields: [
        { id: 'employee-name', type: 'text', label: 'Employee’s name', required: true },
        { id: 'position', type: 'text', label: 'Position (tasks)', required: true },
        { id: 'date-hired', type: 'date', mode: 'date', label: 'Date hired' },
        { id: 'orientation-date', type: 'date', mode: 'date', label: 'Date of orientation', required: true },
        { id: 'trainer', type: 'text', label: 'Person providing orientation (name and position)', required: true },
      ],
    },
    {
      id: 'topics',
      title: 'Topics Addressed',
      description: 'Check every topic covered. All topics are required for young and new workers.',
      fields: [
        { id: 'topics-covered', type: 'checkbox', label: 'Topics addressed during orientation', options: ORIENTATION_TOPICS },
        { id: 'topics-notes', type: 'multiline', label: 'Additional details / topics', rows: 2 },
      ],
    },
    {
      id: 'sign',
      title: 'Sign-off',
      fields: [
        { id: 'trainer-sig', type: 'signature', label: 'Trainer signature', required: true },
        { id: 'worker-sig', type: 'signature', label: 'Worker signature', required: true },
      ],
    },
  ],
};

// ── 2. Hand & Power Tools Inspection ──
const TOOLS = {
  ...base('tools-inspection-bb-v1', 'Hand & Power Tools Inspection (Brown Bros)',
    'Supervisor completes per project. Yes / No / N/A per criterion.', 'inspection'),
  sections: [
    {
      id: 'hand-tools',
      title: 'Hand Tools and Equipment',
      fields: [
        yn('ht-condition', 'Are tools and equipment (company and personal) in good condition?'),
        yn('ht-mushroomed', 'Are chisels, punches or other mushroomed head tools repaired or replaced?'),
        yn('ht-handles', 'Are broken handles on hammers and axes replaced promptly?'),
        yn('ht-wrenches', 'Are worn or bent wrenches repaired or replaced?'),
        yn('ht-files', 'Do files have handles?'),
        yn('ht-eye-protection', 'Is eye and face protection worn while using hand tools that might produce flying materials or breakage?'),
        yn('ht-trained', 'Have employees been trained to use hand tools properly?'),
        yn('ht-jacks', 'Are jacks checked for good operating condition and marked with the jack capacity?'),
      ],
    },
    {
      id: 'power-tools',
      title: 'Portable Power Tools and Equipment',
      fields: [
        yn('pt-guards', 'Are grinders, saws and similar equipment used with appropriate safety guards?'),
        yn('pt-saw-guards', 'Are portable circular saws equipped with guards above and below the base shoe?'),
        yn('pt-rotating', 'Are rotating or moving parts guarded to prevent physical contact?'),
        yn('pt-grounded', 'Are all cord-connected, electrically operated tools grounded or double insulated?'),
        yn('pt-belt-guards', 'Are guards in place over belts, pulleys, chains and sprockets (mixers, compressors, etc.)?'),
        yn('pt-fans', 'Are portable fans provided with full guards having openings of ½ inch or less?'),
        yn('pt-gfci', 'Are Ground Fault Circuit Interrupters (GFCI) used with portable electrical power tools?'),
        yn('pt-air', 'Is compressed air used for cleaning reduced to a nozzle pressure of 30 psi or less?'),
        yn('pt-hoses', 'Are pneumatic and hydraulic hoses inspected regularly for serviceability?'),
        yn('pt-hoisting', 'Is portable hoisting equipment posted with capacity and latest load test information?'),
        yn('pt-chainsaws', 'Do chain saws have anti-kickback devices?'),
      ],
    },
    {
      id: 'grinders',
      title: 'Abrasive Wheel Grinders',
      fields: [
        yn('gr-work-rest', 'Is the work rest adjusted to within 1/8 inch on the wheel?'),
        yn('gr-tongue-guard', 'Is the tongue guard adjusted to within ¼ inch of the wheel?'),
        yn('gr-side-guards', 'Do side guards cover the spindle, nut, flange and 75% of the wheel diameter?'),
        yn('gr-mounted', 'Are bench and pedestal grinders permanently mounted?'),
        yn('gr-goggles', 'Are goggles or face shields always worn while grinding?'),
        yn('gr-rpm', 'Is the max RPM rating of each abrasive wheel compatible with the grinder motor RPM?'),
        yn('gr-switch', 'Does each grinder have an individual on and off control?'),
        yn('gr-dust', 'Are dust collectors or powered exhausts provided?'),
      ],
    },
    {
      id: 'power-actuated',
      title: 'Power Actuated Tools',
      fields: [
        yn('pa-trained', 'Are operators trained and carrying a valid operators card?'),
        yn('pa-storage', 'Is each power-actuated tool stored in its own locked container when not in use?'),
        yn('pa-sign', 'Is a 7"×10" bold "POWER ACTUATED TOOL IN USE" sign conspicuously placed?'),
        yn('pa-unloaded', 'Are power-actuated tools left unloaded until ready to be used?'),
        yn('pa-daily', 'Are power actuated tools inspected for obstructions or defects each day before use?'),
        yn('pa-ppe', 'Do operators have and use appropriate PPE (head, eye, hearing, etc.)?'),
      ],
    },
    {
      id: 'wrap',
      title: 'Remarks & Sign-off',
      fields: [
        { id: 'remarks', type: 'multiline', label: 'Additional remarks', rows: 3 },
        { id: 'supervisor-sig', type: 'signature', label: 'Supervisor signature', required: true },
      ],
    },
  ],
};

// ── 3. Scaffolding Safety Checklist ──
const SCAFFOLD_GENERAL = [
  ['sc1', 'Is the supporting surface capable of withstanding the weight of the scaffold? (OHSR 4.2, 13.17)'],
  ['sc2', 'Any potential contact with exposed electrical equipment/conductors? Is the scaffold outside limits of approach? (OHSR 13.19, 19.12(3), 19.24.1)'],
  ['sc3', 'Are workers erecting/using the scaffold trained and supervised in confirming structural capability? (OHSR 13.13)'],
  ['sc4', 'Installed per manufacturer’s instructions, standards, and engineer’s requirements — all cross braces installed? (OHSR 13.2, 13.11, 13.15)'],
  ['sc5', 'Are manufacturer’s or engineer’s instructions readily available on site? (OHSR 13.15)'],
  ['sc6', 'Inspected before each use (green tag / red tag system)? (OHSR 13.3, 13.13)'],
  ['sc7', 'Safe way to get on and off the scaffold, such as a ladder? (OHSR 13.7)'],
  ['sc8', 'Able to withstand the loads likely to be imposed on it? (OHSR 13.8, 13.13)'],
  ['sc9', 'Guardrails and toe boards installed on open sides where space > 30 cm? (OHSR 4.58, 13.14)'],
  ['sc10', 'Platforms at least a nominal width of 50 cm (20 in.)? (OHSR 13.14)'],
  ['sc11', 'Platforms secured against separation from supporting equipment/structure? (OHSR 13.8)'],
  ['sc12', 'Platform fully planked/decked with no gaps greater than 25 cm? (OHSR 13.14)'],
  ['sc13', 'Ledgers and bearers level, vertical members plumb? (OHSR 13.17(1))'],
  ['sc14', 'Where applicable, constructed/installed/used per written instructions of a professional engineer (tarped, >38 m, stairways >25 m, temporary floor, suspended/cantilevered, needle-beam, outrigger, other high-risk)? (OHSR 13.11, 13.32)'],
  ['sc15', 'Height > 3× minimum base width — if yes, effectively guyed or secured to a structure? (OHSR 13.17)'],
  ['sc16', 'Safe way of getting materials to each platform (not carried up ladders)? (OHSR 13.6)'],
  ['sc17', 'Workers below the scaffold — appropriate falling-material protection in place? (OHSR 20.9)'],
];

const SCAFFOLDING = {
  ...base('scaffolding-inspection-bb-v1', 'Scaffolding Safety Checklist (Brown Bros)',
    'Complete before use. OHSR references included per question.', 'inspection'),
  sections: [
    { id: 'general', title: 'General Requirements', fields: SCAFFOLD_GENERAL.map(([id, label]) => yn(id, label)) },
    {
      id: 'wood', title: 'Wood-Frame Scaffold Requirements',
      fields: [
        yn('wf1', 'Lumber graded and marked to NLGA Standard Grading Rules (No. 2 or better, specified species)? (OHSR 13.16)'),
        yn('wf2', 'Lumber free of cracks, splits, knots, and damage? (OHSR 13.3, 13.13)'),
        yn('wf3', 'Vertical uprights spliced per WCB Standard WPL 1-2004? (OHSR 13.2)'),
      ],
    },
    {
      id: 'manufactured-rolling', title: 'Manufactured / Rolling / Other',
      fields: [
        yn('mf1', 'All braces, bearers, clamps and connections appropriately secured? (OHSR 13.18)'),
        yn('rl1', 'Wheels and casters locked while workers are on the scaffold? (OHSR 13.24)'),
        yn('rl2', 'Is the scaffold designed and intended to be moved while a worker is on the platform? (OHSR 13.24)'),
        yn('ot1', 'Platform suspended from crane/hoist — procedures, instructions, engineering docs on site? (OHSR 13.27, 14.42.1)'),
        yn('ot2', 'Platform mounted on a lift truck — documentation per standard available on site? (OHSR 13.30)'),
      ],
    },
    {
      id: 'wrap', title: 'Next Steps & Sign-off',
      fields: [
        { id: 'next-steps', type: 'multiline', label: 'For any "No" answers — next steps', rows: 3 },
        { id: 'inspected-by', type: 'text', label: 'Inspected by', required: true },
        { id: 'inspector-sig', type: 'signature', label: 'Signature', required: true },
      ],
    },
  ],
};

// ── 4. Safety Harness Inspection ──
const HARNESS = {
  ...base('harness-inspection-bb-v1', 'Safety Harness Inspection (Brown Bros)',
    'Per harness, before use. Use with the manufacturer’s manual.', 'inspection'),
  sections: [
    {
      id: 'harness-id',
      title: 'Harness Identification',
      fields: [
        { id: 'uid-number', type: 'text', label: 'Unique identification number', required: true },
        { id: 'first-use', type: 'date', mode: 'date', label: 'Date of first use' },
        { id: 'mfg-date', type: 'date', mode: 'date', label: 'Manufacture date' },
      ],
    },
    {
      id: 'points',
      title: 'Inspection Points',
      fields: [
        pf('hp1', 'Label: serial number legible, date of last formal inspection found'),
        pf('hp2', 'Manufacturer date checked — service life remaining'),
        pf('hp3', 'Rear D-ring: no distortion, cracking, rust, nicks or burrs; pivots freely'),
        pf('hp4', 'Remaining hardware: backplate, fastenings, buckles, adjusters, connectors — no damage/cracks/discolouration'),
        pf('hp5', 'Webbing straps and general shape: harness hangs evenly when buckled'),
        pf('hp6', 'Webbing free of tears, cuts, fraying, excessive abrasion, loose seams, fading'),
        pf('hp7', 'Straps: no UV/chemical damage or brittleness (colour check)'),
        pf('hp8', 'Webbing texture: not hard or brittle from chemical damage'),
        pf('hp9', 'Each strap: no fraying or broken fibres — fibre structure intact'),
      ],
    },
    {
      id: 'wrap',
      title: 'Notes & Sign-off',
      fields: [
        { id: 'notes', type: 'multiline', label: 'Additional notes', rows: 2 },
        { id: 'inspector-sig', type: 'signature', label: 'Inspected by (signature)', required: true },
      ],
    },
  ],
};

// ── 5. RFI ──
const RFI = {
  ...base('rfi-bb-v1', 'RFI — Request For Information (Brown Bros)',
    'Question to the GC / consultant. Auto-filed with the project record.', 'custom'),
  sections: [
    {
      id: 'rfi-head',
      title: 'RFI Details',
      fields: [
        { id: 'rfi-number', type: 'text', label: 'RFI number', required: true, placeholder: 'e.g. RFI-014' },
        { id: 'description', type: 'text', label: 'Description', required: true },
        { id: 'prepared-by', type: 'text', label: 'Prepared by', required: true },
        { id: 'recipient', type: 'text', label: 'Recipient', required: true },
        { id: 'priority', type: 'dropdown', label: 'Priority', options: ['High Priority', 'Normal Priority', 'Low Priority'], required: true },
        { id: 'cost-impact', type: 'text', label: 'Cost impact', placeholder: 'TBD' },
        { id: 'schedule-impact', type: 'text', label: 'Schedule impact', placeholder: 'TBD' },
      ],
    },
    {
      id: 'rfi-body',
      title: 'Request',
      fields: [
        { id: 'question', type: 'multiline', label: 'Request question', rows: 5, required: true },
        { id: 'photos', type: 'image', label: 'Reference photos / drawing details', max: 4 },
      ],
    },
  ],
};

// ── Templates (safety documents in every worker's pocket) ──
const TEMPLATES = [
  { id: 'bb-ohs-manual', title: 'OH&S Manual (Aug 1, 2025)', file: 'seed-assets/Brown Bros Framing And Drywall Ltd. OH & Safety Manual (Updated Aug 1, 2025).pdf' },
  { id: 'bb-subcontractor-policy', title: 'Policy for Subcontractors', file: 'seed-assets/BB_Policy_For_Subcontractors.pdf' },
  { id: 'bb-sign-sheet', title: 'Crew Sign Sheet (printable)', file: 'seed-assets/SignSheet.pdf' },
];

async function main() {
  for (const schema of [ORIENTATION, TOOLS, SCAFFOLDING, HARNESS, RFI]) {
    console.log(`Seeding forms/${schema.id} …`);
    await db.doc(`forms/${schema.id}`).set(schema);
  }

  for (const t of TEMPLATES) {
    if (!existsSync(t.file)) { console.log(`  ! missing ${t.file} — skipped`); continue; }
    console.log(`Uploading template: ${t.title} …`);
    const storagePath = `templates/${t.id}/document.pdf`;
    await bucket.file(storagePath).save(readFileSync(t.file), { contentType: 'application/pdf' });
    await db.doc(`templates/${t.id}`).set({
      title: t.title, storagePath, uploadedAt: Date.now(), uploadedBy: 'SEED:brownbros-pack',
    });
  }

  console.log('Done. 5 forms live in the Forms browser; 3 documents in Safety Documents.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
