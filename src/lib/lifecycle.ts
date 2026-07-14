/**
 * The lifecycle engine — the app IS the process.
 *
 * Six stages per project; each stage's checklist is computed from REAL data
 * (drawings uploaded, certs on file, deficiencies open…), never self-reported.
 * Every failed check carries an instruction telling the office exactly how
 * to clear it.
 */

import {
  collection, doc, getDoc, getDocs, limit, query, where,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Project } from '../types';

export const STAGES = ['contract', 'setup', 'crew', 'build', 'punch', 'closeout'] as const;
export type Stage = typeof STAGES[number];

export const STAGE_LABELS: Record<Stage, string> = {
  contract: 'Contract',
  setup: 'Setup',
  crew: 'Crew',
  build: 'Build',
  punch: 'Punch List',
  closeout: 'Closeout',
};

export interface StageCheck {
  id: string;
  label: string;          // what this check is
  pass: boolean;
  instruction: string;    // how to clear it when failing
}

export interface Phase {
  id: string;
  name: string;
  order: number;
  status: 'pending' | 'active' | 'done';
  targetStart?: string;   // YYYY-MM-DD
  targetEnd?: string;
  invoiceMilestone?: boolean;
  completedAt?: number;
  completedBy?: string;
  /** Money view: set when the office marks this 💰 milestone invoiced. */
  invoicedAt?: number | null;
  invoicedBy?: string | null;
}

/** Trade template packs — house framing first; more trades = more entries. */
export const PHASE_TEMPLATES: Record<string, Array<{ name: string; invoiceMilestone?: boolean }>> = {
  'House framing': [
    { name: 'Layout & sill plates' },
    { name: 'Main floor walls', invoiceMilestone: true },
    { name: 'Second floor & stairs' },
    { name: 'Roof framing', invoiceMilestone: true },
    { name: 'Sheathing & detail' },
    { name: 'Backframing & punch', invoiceMilestone: true },
  ],
  'Drywall': [
    { name: 'Board delivery & stocking' },
    { name: 'Hanging', invoiceMilestone: true },
    { name: 'Taping & mudding' },
    { name: 'Sanding & touch-up' },
    { name: 'Final inspection', invoiceMilestone: true },
  ],
};

export function stageIndex(s: Stage | undefined): number {
  return Math.max(0, STAGES.indexOf((s ?? 'contract') as Stage));
}

/**
 * Compute the current stage's checklist from live data.
 * All reads are admin/manager-scope (this runs on the office dashboard).
 */
export async function computeStageChecks(project: Project, phases: Phase[]): Promise<StageCheck[]> {
  const stage = (project.stage === 'archived' ? 'closeout' : project.stage ?? 'contract') as Stage;
  const pid = project.id;
  const checks: StageCheck[] = [];
  const add = (id: string, label: string, pass: boolean, instruction: string) =>
    checks.push({ id, label, pass, instruction });

  if (stage === 'contract') {
    add('client', 'Client linked', !!project.clientId,
      'Link the client: Clients → add the GC/owner, then select them on this project.');
    add('contract-doc', 'Contract document attached', !!project.contractPath,
      'Attach the signed contract PDF below — it becomes part of the project record.');
    add('value', 'Contract value entered', typeof project.contractValue === 'number' && project.contractValue > 0,
      'Enter the contract value below (kept office-only).');
  }

  if (stage === 'setup') {
    let plansCount = 0;
    try { plansCount = (await getDocs(query(collection(db, 'projects', pid, 'plans'), limit(1)))).size; } catch { /* skip */ }
    add('drawings', 'Site drawings uploaded', plansCount > 0,
      'Upload at least one drawing: foreman photographs it on site, or office uploads from desktop (Site Drawings).');
    add('phases', 'Build phases created', phases.length > 0,
      'Create the phase plan below — start from the trade template and adjust dates.');
    const gf = project.geofence?.center;
    add('geofence', 'Geofence set', !!project.geofenceEnabled && !!gf && (gf.lat !== 0 || gf.lng !== 0),
      'Set the site geofence in Projects → edit — GPS clock-in depends on it.');
    add('flha', 'FLHA form assigned', !!project.defaultFlhaFormId,
      'Assign the daily FLHA (run the Brown Bros seed or set defaultFlhaFormId).');
  }

  if (stage === 'crew') {
    let members: Array<{ uid: string; role?: string }> = [];
    try {
      const snap = await getDocs(collection(db, 'projects', pid, 'members'));
      members = snap.docs.map((d) => ({ uid: d.id, ...(d.data() as { role?: string }) }));
    } catch { /* skip */ }
    const hasForeman = members.some((m) => ['foreman', 'lead-foreman', 'supervisor'].includes(m.role ?? ''));
    add('foreman', 'Foreman assigned', hasForeman,
      'Promote one crew member: Users → expand → tap the role chip to Foreman.');
    add('crew-size', `Crew assigned (${members.length})`, members.length >= 2,
      'Assign the crew: Users → tick this project on each worker.');

    // First-aid attendant: any crew member with a valid first-aid/OFA cert.
    let hasFirstAid = false;
    try {
      for (const m of members) {
        const certs = await getDocs(collection(db, 'users', m.uid, 'certifications'));
        if (certs.docs.some((c) => {
          const t = `${c.data().type ?? ''} ${c.data().displayName ?? ''}`.toLowerCase();
          const exp = c.data().expiresAt;
          const valid = typeof exp !== 'number' || exp > Date.now();
          return valid && (t.includes('first') || t.includes('ofa') || t.includes('aid'));
        })) { hasFirstAid = true; break; }
      }
    } catch { /* certs unreadable → check stays red with instruction */ }
    add('first-aid', 'First-aid attendant on crew', hasFirstAid,
      'WorkSafeBC: a crew this size needs a valid OFA ticket on site. Add the cert under the worker’s My Tickets, or assign a certified worker.');
  }

  if (stage === 'build') {
    const done = phases.filter((p) => p.status === 'done').length;
    add('phases-done', `Phases complete (${done}/${phases.length})`,
      phases.length > 0 && done === phases.length,
      'Work through the phases below — the foreman marks each done as the crew finishes.');
  }

  if (stage === 'punch') {
    let openDefs = 0;
    try {
      openDefs = (await getDocs(query(collection(db, 'projects', pid, 'deficiencies'), where('status', '==', 'open')))).size;
    } catch { /* skip */ }
    add('deficiencies', openDefs === 0 ? 'No open deficiencies' : `${openDefs} open deficienc${openDefs === 1 ? 'y' : 'ies'}`,
      openDefs === 0,
      'Close every deficiency on the Punch List — this stage cannot complete around open items.');
  }

  if (stage === 'closeout') {
    let hasFinalQc = false;
    try {
      const subs = await getDocs(query(collection(db, 'projects', pid, 'submissions'), limit(300)));
      hasFinalQc = subs.docs.some((d) => String((d.data() as { schemaId?: string }).schemaId ?? '').startsWith('qc-'));
    } catch { /* skip */ }
    add('final-qc', 'Final QC submitted', hasFinalQc,
      'Foreman completes the Quality Check form for the final walkthrough (Forms → Quality Check).');
    add('audit', 'Audit pack generated', !!(project as { auditAt?: number }).auditAt,
      'Generate the audit pack with the button below — the full project record in one PDF for the client handoff.');
  }

  return checks;
}
