/**
 * Fills the REAL Brown Bros / MHSA Field Level Hazard Assessment PDF
 * (functions/assets/flha-mhsa-fillable.pdf) from a Consite submission —
 * the office receives the exact form they already know, checkboxes ticked,
 * signatures inked in the right boxes.
 *
 * Field names were extracted from the fillable template's AcroForm.
 */

import { PDFDocument } from 'pdf-lib';
import { readFileSync } from 'fs';
import path from 'path';

type Values = Record<string, unknown>;

// Consite checkbox option label → PDF checkbox field name
const CHECKBOX_MAP: Record<string, string> = {
  // Physical
  'Housekeeping': 'Housekeeping',
  'Material storage & handling': 'Material storage  handling',
  'Slip/Trip/Fall potential': 'SlipTripFall potential',
  'Blocked exits & walkways': 'Blocked exits  walkways',
  'Confined/restricted space': 'Confinedrestricted space',
  'Improper ventilation': 'Improper ventilation',
  'Powerlines overhead/underground': 'Powerlines overhead',
  'Ground/surface condition': 'Groundsurface condition',
  'Open excavation': 'Open Excavation',
  'Lighting': 'Lighting',
  'Weather': 'Weather',
  'Hot work': 'Hot work',
  'Vehicle/pedestrian traffic': 'Vehiclepedestrian traffic',
  'Working at heights': 'Working at heights',
  'Scaffolding': 'Scaffolding',
  'Falling objects': 'Falling objects',
  'Loads moving or being hoisted': 'Loads moving or being hoisted',
  'Ladder use': 'Ladder use',
  'Critical lift': 'Critical Lift',
  'Others working below/overhead': 'Others working',
  'Incorrect tools/equipment': 'Incorrect toolsequipment',
  'Working on/near energized equipment': 'Working onnear energized',
  'Defective tools/equipment': 'Defective toolsequipment',
  'Unguarded equipment': 'Unguarded equipment',
  'Noise': 'Noise',
  'Vibration': 'undefined',
  // Ergonomic
  'Awkward body positioning': 'Awkward body positioning',
  'Overextension': 'Overextension',
  'Repetitive motion': 'Repetitive Motion',
  'Twisting/reaching/bending': 'Twistingreachingbending',
  'Cramped/tight work area': 'Crampedtight work area',
  'Forceful pushing/pulling': 'Forceful pushingpulling',
  'Awkward grip/load carried': 'Awkward gripload carried',
  'Working at overhead height': 'Working at over head',
  // Chemical
  'Freeze burn': 'Freeze burn',
  'Chemical handling/storage': 'Chemical handlingstorage',
  'Spill potential': 'Spill potential',
  'Dust/fumes/vapours/gases': 'undefined_2',
  'Fire/explosion/reactive properties': 'undefined_3',
  'Acid/corrosive material': 'Acidcorrosive material',
  'Aerosols': 'undefined_4',
  // Biological
  'Waste disposal': 'Waste disposal',
  'Blood/bodily fluid': 'Bloodbodily fluid',
  'Virus/bacteria': 'Virusbacteria',
  'Insect bite': 'Insect bite',
  'Lack of hygiene/sanitation': 'undefined_5',
  // Psychosocial
  'Personal limitations/illness/age/mental stability': 'Personal limitationsillness',
  'Harassment/violence': 'Harassmentviolence',
  'Stress/fatigue': 'Stressfatigue',
  'Working alone': 'Working alone',
  'Worker(s) not competent': 'undefined_6',
};

const sigBytes = (v: unknown): Buffer | null =>
  typeof v === 'string' && v.startsWith('data:image')
    ? Buffer.from(v.split(',')[1] ?? '', 'base64')
    : null;

export async function fillFlhaTemplate(opts: {
  values: Values;
  dateStr: string;
  submittedBy: string;
}): Promise<Buffer> {
  const { values, dateStr, submittedBy } = opts;
  const template = readFileSync(path.join(__dirname, '..', 'assets', 'flha-mhsa-fillable.pdf'));
  const doc = await PDFDocument.load(template);
  const form = doc.getForm();

  const setText = (name: string, v: unknown) => {
    if (v === undefined || v === null || v === '') return;
    try { form.getTextField(name).setText(String(v)); } catch { /* field mismatch — skip */ }
  };
  const check = (name: string) => {
    try { form.getCheckBox(name).check(); } catch { /* skip */ }
  };
  const radio = (name: string, yes: boolean, optYes: string, optNo: string) => {
    try { form.getRadioGroup(name).select(yes ? optYes : optNo); } catch { /* skip */ }
  };

  // ── Page 1: task + hazard checkboxes + PPE/safety info ──
  setText('Describe the tasks being performedRow1', values['task']);
  for (const key of ['hz-physical', 'hz-ergo', 'hz-chem', 'hz-bio', 'hz-psy']) {
    const arr = values[key];
    if (!Array.isArray(arr)) continue;
    for (const opt of arr) {
      const pdfName = CHECKBOX_MAP[String(opt)];
      if (pdfName) check(pdfName);
    }
  }
  // "Other" write-in lines (template names them after the adjacent printed label)
  setText('Vibration', values['hz-physical-other']);
  setText('height', values['hz-ergo-other']);
  setText('Aerosols', values['hz-chem-other']);

  setText('List PPE Required', values['ppe']);
  if (values['ppe-inspected'] === true) check('Yes'); else check('No');
  setText('Location of First Aid supplies', values['first-aid']);
  setText('Emergency Muster Location', values['muster']);
  setText('Check-in Procedure', values['alone']);

  // ── Page 2: header, control plan, checks, comments ──
  setText('Company Name', values['company'] ?? 'Brown Bros Framing and Drywall');
  setText('Date', typeof values['date'] === 'number' ? new Date(values['date'] as number).toLocaleDateString('en-CA') : dateStr);
  setText('Worksite Representative NamePhone', values['rep']);

  for (let n = 1; n <= 4; n++) {
    setText(`HAZARDRow${n}`, values[`hazard-${n}`]);
    setText(`CONTROLSRow${n}`, values[`controls-${n}`]);
    const risk = values[`risk-${n}`];
    if (typeof risk === 'string' && risk) setText(`RISK RATINGRow${n}`, risk.split(' ')[0]); // "6 — High" → "6"
  }

  const yesish = (v: unknown) => typeof v === 'string' && v.toLowerCase().startsWith('y');
  radio('undefined_7', yesish(values['lockout']), 'Yes_2', 'No_2');
  radio('undefined_8', yesish(values['notified']), 'Yes_3', 'No_3');
  radio('undefined_9', yesish(values['cleanup']), 'Yes_4', 'No_4');
  radio('Did any incidents occur', yesish(values['incidents']), 'Yes_5', 'No_5');
  setText('Did any incidents occur Yes No If yes explain', values['incident-explain']);
  setText('1', values['rep-comments']);

  // Crew sign-off rows: name + time as text; signature ink drawn after flatten
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Vancouver' });
  const sigDraws: Array<{ fieldName: string; bytes: Buffer }> = [];
  for (let n = 1; n <= 4; n++) {
    const name = values[`crew-name-${n}`];
    if (name) {
      setText(`WORKER NAME printRow${n}`, name);
      setText(`TIMERow${n}`, timeStr);
      setText(`INITIALRow${n}`, String(name).split(/\s+/).map((w) => w[0] ?? '').join('').toUpperCase());
    }
    const b = sigBytes(values[`crew-sig-${n}`]);
    if (b) sigDraws.push({ fieldName: `SIGNATURERow${n}`, bytes: b });
  }
  const foremanSig = sigBytes(values['foreman-sig']);
  if (foremanSig) sigDraws.push({ fieldName: 'Supervisor Signature', bytes: foremanSig });
  const repSig = sigBytes(values['rep-sig']);
  if (repSig) sigDraws.push({ fieldName: 'Worksite Representative Signature', bytes: repSig });
  setText('Date_2', dateStr);
  if (repSig) setText('Date_3', dateStr);

  // Capture signature-field rectangles BEFORE flattening, then draw ink on top.
  const rects = sigDraws.map(({ fieldName, bytes }) => {
    const widget = form.getTextField(fieldName).acroField.getWidgets()[0];
    return { rect: widget.getRectangle(), bytes };
  });

  form.flatten();

  const page2 = doc.getPage(1);
  for (const { rect, bytes } of rects) {
    const png = await doc.embedPng(bytes);
    // Signatures are wide+short; scale into the row box with a little overflow upward.
    const h = Math.min(rect.height * 2.2, 30);
    const w = Math.min(rect.width, (png.width / png.height) * h);
    page2.drawImage(png, { x: rect.x + 2, y: rect.y - 2, width: w, height: h });
  }

  // Audit footer on page 2
  page2.drawText(
    `Consite record · submitted by ${submittedBy} · ${new Date().toISOString()} · GPS + timestamp verified`,
    { x: 40, y: 18, size: 6.5 },
  );

  return Buffer.from(await doc.save());
}
